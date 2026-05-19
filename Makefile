include .env
export

SCUI_HOST       ?= localhost:8080
SCUI_PROTOCOL   ?= http
CONTAINER_IMAGE ?= scui-site:latest
TF_DIR          := terraform

# ---------------------------------------------------------------------------
# Local development
# ---------------------------------------------------------------------------
.PHONY: dev
dev:
	@echo "Starting SCUI dev server on http://localhost:8080 ..."
	node dev-server.js

# ---------------------------------------------------------------------------
# Container build
# ---------------------------------------------------------------------------
.PHONY: build
build:
	podman build -f setup/Containerfile -t $(CONTAINER_IMAGE) .

# ---------------------------------------------------------------------------
# AWS infrastructure (Terraform)
# ---------------------------------------------------------------------------
.PHONY: init deploy teardown

init:
	cd $(TF_DIR) && terraform init

deploy: init
	cd $(TF_DIR) && terraform apply \
		-var="aws_access_key=$(AWS_ACCESS_KEY_ID)" \
		-var="aws_secret_key=$(AWS_SECRET_ACCESS_KEY)" \
		-var="aws_region=$(AWS_REGION)" \
		-var="aap_base_url=$(AAP_BASE_URL)" \
		-var="aap_bearer_token=$(AAP_BEARER_TOKEN)" \
		-var="api_client_bearer_token=$(AAP_API_CLIENT_BEARER_TOKEN)" \
		-var="container_image=$(DE_IMAGE)" \
		-var="domain=$(SCUI_DOMAIN)" \
		-var="cert_email=$(CERT_EMAIL)" \
		-auto-approve
	@echo ""
	@echo "== Deployed =="
	@cd $(TF_DIR) && terraform output -raw public_ip

teardown: init
	cd $(TF_DIR) && terraform destroy \
		-var="aws_access_key=$(AWS_ACCESS_KEY_ID)" \
		-var="aws_secret_key=$(AWS_SECRET_ACCESS_KEY)" \
		-var="aws_region=$(AWS_REGION)" \
		-var="aap_base_url=$(AAP_BASE_URL)" \
		-var="aap_bearer_token=$(AAP_BEARER_TOKEN)" \
		-var="api_client_bearer_token=$(AAP_API_CLIENT_BEARER_TOKEN)" \
		-var="container_image=$(DE_IMAGE)" \
		-var="domain=$(SCUI_DOMAIN)" \
		-var="cert_email=$(CERT_EMAIL)" \
		-auto-approve

# ---------------------------------------------------------------------------
# AAP Configuration as Code
# ---------------------------------------------------------------------------
.PHONY: aap-apply

aap-apply:
	@echo "Applying AAP Configuration as Code ..."
	./ansible_deployment/scripts/cac-apply.sh

# ---------------------------------------------------------------------------
# Scenario break (Ansible playbooks)
# ---------------------------------------------------------------------------
.PHONY: break-engine-failure

break-engine-failure:
	@echo "Breaking: Engine Failure (stopping Warpdrive Engine) ..."
	ansible-playbook playbooks/break/engine_failure.yml

# ---------------------------------------------------------------------------
# Scenario resolution (curl)
# ---------------------------------------------------------------------------
define resolve_scenario
	@curl -s -o /dev/null -w "HTTP %{http_code}\n" \
		-X POST $(SCUI_PROTOCOL)://$(SCUI_HOST)/api/controller/ui/home \
		-H 'Content-Type: application/json' \
		-d '{"scenario":"$(1)_resolved"}'
endef

.PHONY: resolve-engine-failure resolve-solar-storm resolve-shields-down

resolve-engine-failure:
	@echo "Resolving engine_failure ..."
	$(call resolve_scenario,engine_failure)

resolve-solar-storm:
	@echo "Resolving solar_storm ..."
	$(call resolve_scenario,solar_storm)

resolve-shields-down:
	@echo "Resolving shields_down ..."
	$(call resolve_scenario,shields_down)

# ---------------------------------------------------------------------------
# Help
# ---------------------------------------------------------------------------
.PHONY: help
help:
	@echo "SCUI Makefile targets:"
	@echo ""
	@echo "  make dev                   Start local dev server (no containers)"
	@echo "  make build                 Build container image with Podman"
	@echo "  make deploy                Provision EC2 + deploy container (Terraform)"
	@echo "  make teardown              Destroy EC2 infrastructure (Terraform)"
	@echo "  make aap-apply             Apply AAP Configuration as Code"
	@echo ""
	@echo "  make break-engine-failure    Stop Warpdrive Engine (triggers EDA)"
	@echo ""
	@echo "  make resolve-engine-failure"
	@echo "  make resolve-solar-storm"
	@echo "  make resolve-shields-down"
	@echo ""
	@echo "Override SCUI_HOST to target a deployed instance:"
	@echo "  make resolve-engine-failure SCUI_HOST=1.2.3.4"
