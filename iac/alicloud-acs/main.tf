data "alicloud_zones" "available" {
  available_resource_creation = "VSwitch"
}

locals {
  zone_ids = slice(data.alicloud_zones.available.zones[*].id, 0, length(var.vswitch_cidrs))

  sandbox_manager_config = merge(var.sandbox_manager_extra_config, {
    e2b = merge(try(var.sandbox_manager_extra_config.e2b, {}), {
      domain      = var.e2b_domain
      adminApiKey = var.sandbox_admin_api_key
    })
    ingress = merge(try(var.sandbox_manager_extra_config.ingress, {}), {
      className = var.sandbox_manager_ingress_class
      tls       = var.sandbox_manager_tls
    })
  })
}

resource "alicloud_vpc" "this" {
  vpc_name   = "${var.name_prefix}-vpc"
  cidr_block = var.vpc_cidr
  tags       = var.tags
}

resource "alicloud_vswitch" "this" {
  count = length(var.vswitch_cidrs)

  vpc_id       = alicloud_vpc.this.id
  zone_id      = local.zone_ids[count.index]
  cidr_block   = var.vswitch_cidrs[count.index]
  vswitch_name = "${var.name_prefix}-${count.index + 1}"
  tags         = var.tags
}

resource "alicloud_cs_managed_kubernetes" "this" {
  name                           = "${var.name_prefix}-cluster"
  profile                        = "Acs"
  cluster_spec                   = "ack.pro.small"
  version                        = var.kubernetes_version
  vswitch_ids                    = alicloud_vswitch.this[*].id
  service_cidr                   = var.service_cidr
  new_nat_gateway                = var.enable_snat
  slb_internet_enabled           = var.enable_public_api_server
  deletion_protection            = var.deletion_protection
  skip_set_certificate_authority = true
  tags                           = var.tags

  addons {
    name = "managed-coredns"
  }

  addons {
    name = "metrics-server"
  }

  addons {
    name = "managed-aliyun-acr-credential-helper"
  }

  addons {
    name = "alb-ingress-controller"
    config = jsonencode({
      albIngress = {
        CreateDefaultALBConfig = var.create_default_alb
      }
    })
  }

  lifecycle {
    precondition {
      condition     = !var.deletion_protection
      error_message = "Disposable validation stacks must keep deletion_protection=false."
    }

    precondition {
      condition     = !var.create_default_alb || var.sandbox_manager_tls
      error_message = "A default external ALB requires sandbox_manager_tls=true; use internal access for HTTP validation."
    }
  }
}

resource "alicloud_cs_kubernetes_addon" "virtual_node" {
  cluster_id = alicloud_cs_managed_kubernetes.this.id
  name       = "acs-virtual-node"
}

resource "alicloud_cs_kubernetes_addon" "sandbox_controller" {
  cluster_id = alicloud_cs_managed_kubernetes.this.id
  name       = "ack-agent-sandbox-controller"

  depends_on = [alicloud_cs_kubernetes_addon.virtual_node]
}

resource "alicloud_cs_kubernetes_addon" "sandbox_manager" {
  cluster_id = alicloud_cs_managed_kubernetes.this.id
  name       = "ack-sandbox-manager"
  config     = jsonencode(local.sandbox_manager_config)

  depends_on = [alicloud_cs_kubernetes_addon.sandbox_controller]
}

data "alicloud_cs_cluster_credential" "this" {
  cluster_id  = alicloud_cs_managed_kubernetes.this.id
  output_file = "${path.module}/generated/kubeconfig"

  depends_on = [alicloud_cs_kubernetes_addon.sandbox_manager]
}
