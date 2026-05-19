variable "aws_access_key" {
  description = "AWS access key ID"
  type        = string
  sensitive   = true
}

variable "aws_secret_key" {
  description = "AWS secret access key"
  type        = string
  sensitive   = true
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-west-1"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.medium"
}

variable "key_name" {
  description = "Name of an existing EC2 key pair for SSH access (leave empty to skip SSH key)"
  type        = string
  default     = ""
}

variable "container_image" {
  description = "Fully-qualified container image to pull and run"
  type        = string
  default     = "quay.io/crenwick93/scui-site:dev-amd64-v3"
}

variable "aap_base_url" {
  description = "AAP controller API base URL (with trailing slash)"
  type        = string
  default     = ""
}

variable "aap_bearer_token" {
  description = "AAP bearer token for the reverse proxy"
  type        = string
  default     = ""
  sensitive   = true
}

variable "api_client_bearer_token" {
  description = "Bearer token required by the UI control API"
  type        = string
  default     = ""
  sensitive   = true
}

variable "domain" {
  description = "Domain name for Let's Encrypt TLS (e.g. spaceship.chrislab.dev)"
  type        = string
  default     = ""
}

variable "cert_email" {
  description = "Email for Let's Encrypt certificate notifications"
  type        = string
  default     = ""
}
