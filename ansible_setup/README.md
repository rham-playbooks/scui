# Ansible setup

This directory contains the playbook and role to deploy the SCUI container via Podman.

## Prereqs

```bash
pipx install ansible
ansible-galaxy collection install -r ansible_setup/requirements.yml
```

## Inventory

Edit `ansible_setup/inventory.ini` to target your EC2 host(s).

## Variables

Set via inventory/group_vars or `-e`:

- image_ref: fully qualified image (e.g., `quay.io/YOUR_NS/scui-site:v2`). If empty, role builds locally on target.
- deployment_mode: `container` (default) or `quadlet` (systemd-managed).
- host_http_port: published host port (default `8080`).
- aap_base_url: e.g. `https://aap.example.com/api/controller/v2/`
- aap_bearer_token: bearer for AAP proxy.
- api_client_bearer_token: bearer required by UI control API (optional).

## Run

```bash
ansible-playbook -i ansible_setup/inventory.ini ansible_setup/site.yml \
  -e image_ref=quay.io/YOUR_NS/scui-site:v2 \
  -e deployment_mode=quadlet \
  -e host_http_port=80 \
  -e aap_base_url=https://aap.example.com/api/controller/v2/ \
  -e aap_bearer_token=YOUR_TOKEN \
  -e api_client_bearer_token=DEMO_SECRET
```

- Quadlet installs `/etc/containers/systemd/scui-nginx.container` and enables `scui-nginx.service`.
- Container mode runs the container directly and restarts it on changes.

## Update

Push a new image tag to Quay, update `image_ref`, and rerun the playbook.
