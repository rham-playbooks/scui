output "public_ip" {
  description = "Public IP of the SCUI EC2 instance"
  value       = aws_eip.scui.public_ip
}

output "public_dns" {
  description = "Public DNS of the SCUI EC2 instance"
  value       = aws_eip.scui.public_dns
}

output "url" {
  description = "URL to access the SCUI site"
  value       = var.domain != "" ? "https://${var.domain}" : "http://${aws_eip.scui.public_ip}"
}

output "ssh_command" {
  description = "SSH into the SCUI server"
  value       = "ssh -i terraform/scui-key.pem ec2-user@${aws_eip.scui.public_ip}"
}

output "warpdrive_engine_instance_id" {
  description = "Instance ID of the warpdrive-engine (Engine Failure scenario)"
  value       = aws_instance.warpdrive_engine.id
}

output "engine_failure_sqs_queue_url" {
  description = "SQS queue URL for Engine Failure EDA events"
  value       = aws_sqs_queue.engine_failure_events.url
}

output "engine_failure_sqs_queue_name" {
  description = "SQS queue name for Engine Failure EDA events"
  value       = aws_sqs_queue.engine_failure_events.name
}

output "earth_comms_public_ip" {
  description = "Public IP of the Earth Comms instance (earth.chrislab.dev)"
  value       = aws_eip.earth_comms.public_ip
}

output "earth_comms_ssh_command" {
  description = "SSH into the Earth Comms instance"
  value       = "ssh -i terraform/scui-key.pem ec2-user@${aws_eip.earth_comms.public_ip}"
}
