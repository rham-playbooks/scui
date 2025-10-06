# SCUI setup

This directory contains:
- Containerfile and `nginx.conf` to serve the static site with nginx
- Ansible playbook/role to install Podman, build the image, and run the container

## Quick start (Podman only)

From repo root:

```bash
podman build -t scui-site:latest -f setup/Containerfile .
podman run --name scui-nginx -p 8080:80 --rm scui-site:latest
# Open http://localhost:8080
```

## Ansible-driven deployment

1) Install dependencies
```bash
pipx install ansible
ansible-galaxy collection install -r setup/requirements.yml
```

2) Adjust inventory if deploying to remote hosts
Edit `setup/inventory.ini`.

3) Run playbook
```bash
ansible-playbook -i setup/inventory.ini setup/site.yml -e host_http_port=8080
```

Variables:
- `host_http_port` (default 8080)
- `image_name` (default `scui-site:latest`)
- `container_name` (default `scui-nginx`)

Notes:
- On macOS, install Podman Desktop first; Ansible will skip Podman install.
- The image copies `index.html` and `assets/` into `/usr/share/nginx/html`.
- `setup/nginx.conf` is installed as the default server config.
