terraform {
  required_version = ">= 1.3"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}

provider "aws" {
  region     = var.aws_region
  access_key = var.aws_access_key
  secret_key = var.aws_secret_key
}

# ---------------------------------------------------------------------------
# VPC (this account has no default VPC)
# ---------------------------------------------------------------------------

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "scui" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "scui-vpc" }
}

resource "aws_internet_gateway" "scui" {
  vpc_id = aws_vpc.scui.id
  tags   = { Name = "scui-igw" }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.scui.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true

  tags = { Name = "scui-public" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.scui.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.scui.id
  }

  tags = { Name = "scui-public-rt" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# ---------------------------------------------------------------------------
# SSH Key Pair
# ---------------------------------------------------------------------------

resource "tls_private_key" "scui" {
  algorithm = "ED25519"
}

resource "aws_key_pair" "scui" {
  key_name   = "scui-key"
  public_key = tls_private_key.scui.public_key_openssh
}

resource "local_file" "ssh_key" {
  content         = tls_private_key.scui.private_key_openssh
  filename        = "${path.module}/scui-key.pem"
  file_permission = "0600"
}

# ---------------------------------------------------------------------------
# AMI
# ---------------------------------------------------------------------------

data "aws_ami" "rhel9" {
  most_recent = true
  owners      = ["309956199498"] # Red Hat

  filter {
    name   = "name"
    values = ["RHEL-9.*_HVM-*-x86_64-*-Hourly2-GP3"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

resource "aws_security_group" "scui" {
  name        = "scui-sg"
  description = "SCUI web server access"
  vpc_id      = aws_vpc.scui.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "scui-sg"
  }
}

resource "aws_instance" "scui" {
  ami                    = data.aws_ami.rhel9.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.scui.id]
  key_name               = aws_key_pair.scui.key_name

  user_data = templatefile("${path.module}/userdata.sh", {
    container_image         = var.container_image
    aap_base_url            = var.aap_base_url
    aap_bearer_token        = var.aap_bearer_token
    api_client_bearer_token = var.api_client_bearer_token
    domain                  = var.domain
    cert_email              = var.cert_email
  })

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  tags = {
    Name    = "scui-server"
    Demo    = "true"
    Project = "scui"
  }
}

resource "aws_eip" "scui" {
  instance = aws_instance.scui.id

  tags = {
    Name = "scui-eip"
  }
}

# ---------------------------------------------------------------------------
# Engine Failure scenario: "Warpdrive Engine" EC2 + CloudTrail/SQS pipeline
# ---------------------------------------------------------------------------

data "aws_caller_identity" "current" {}

resource "aws_instance" "warpdrive_engine" {
  ami                    = data.aws_ami.rhel9.id
  instance_type          = "t3.micro"
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.scui.id]
  key_name               = aws_key_pair.scui.key_name

  tags = {
    Name     = "warpdrive-engine"
    Demo     = "true"
    Scenario = "engine_failure"
    Project  = "scui"
  }
}

resource "aws_sqs_queue" "engine_failure_events" {
  name                       = "scui-engine-failure-events"
  message_retention_seconds  = 300
  visibility_timeout_seconds = 30
  receive_wait_time_seconds  = 20

  tags = {
    Scenario = "engine_failure"
    Project  = "scui"
  }
}

resource "aws_sqs_queue_policy" "allow_eventbridge" {
  queue_url = aws_sqs_queue.engine_failure_events.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.engine_failure_events.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_cloudwatch_event_rule.engine_failure_stop.arn
          }
        }
      }
    ]
  })
}

resource "aws_cloudwatch_event_rule" "engine_failure_stop" {
  name        = "scui-warpdrive-engine-stopped"
  description = "Matches StopInstances on the warpdrive-engine instance"

  event_pattern = jsonencode({
    source      = ["aws.ec2"]
    detail-type = ["AWS API Call via CloudTrail"]
    detail = {
      eventSource = ["ec2.amazonaws.com"]
      eventName   = ["StopInstances"]
      requestParameters = {
        instancesSet = {
          items = {
            instanceId = [aws_instance.warpdrive_engine.id]
          }
        }
      }
    }
  })

  tags = {
    Scenario = "engine_failure"
    Project  = "scui"
  }
}

resource "aws_cloudwatch_event_target" "engine_failure_sqs" {
  rule      = aws_cloudwatch_event_rule.engine_failure_stop.name
  target_id = "send-to-sqs"
  arn       = aws_sqs_queue.engine_failure_events.arn
}
