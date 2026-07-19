variable "region" {
  description = "Alibaba Cloud region for the ACS cluster."
  type        = string
  default     = "cn-hangzhou"
}

variable "name_prefix" {
  description = "Prefix used for the disposable validation stack."
  type        = string
  default     = "onyxclaw-acs"
}

variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
}

variable "vswitch_cidrs" {
  description = "Two non-overlapping vSwitch CIDRs in distinct zones."
  type        = list(string)
  default     = ["10.42.0.0/20", "10.42.16.0/20"]

  validation {
    condition     = length(var.vswitch_cidrs) >= 2
    error_message = "At least two vSwitch CIDRs are required for high availability."
  }
}

variable "service_cidr" {
  type    = string
  default = "172.20.0.0/16"
}

variable "kubernetes_version" {
  description = "Leave null to use the newest ACS-supported version."
  type        = string
  default     = null
  nullable    = true
}

variable "enable_snat" {
  description = "Provide public egress for pulling images and calling model/channel endpoints."
  type        = bool
  default     = true
}

variable "enable_public_api_server" {
  description = "Needed when running this stack from a laptop outside the VPC."
  type        = bool
  default     = true
}

variable "create_default_alb" {
  description = "Create an ALB for Sandbox Manager. Keep false for VPC-internal APP access."
  type        = bool
  default     = false
}

variable "deletion_protection" {
  description = "Keep false for disposable test stacks so destroy can clean the cluster."
  type        = bool
  default     = false
}

variable "e2b_domain" {
  description = "Domain configured on ack-sandbox-manager, without a wildcard prefix."
  type        = string
}

variable "sandbox_admin_api_key" {
  description = "Initial ack-sandbox-manager administrator API key. Stored in Terraform state."
  type        = string
  sensitive   = true
}

variable "sandbox_manager_ingress_class" {
  type    = string
  default = "alb"
}

variable "sandbox_manager_tls" {
  description = "Enable only after the matching certificate and listener exist."
  type        = bool
  default     = false
}

variable "sandbox_manager_extra_config" {
  description = "Provider-version-specific addon values merged with the reviewed defaults."
  type        = any
  default     = {}
}

variable "tags" {
  type = map(string)
  default = {
    project   = "onyxclaw"
    lifecycle = "disposable"
  }
}
