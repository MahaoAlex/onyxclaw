output "cluster_id" {
  value = alicloud_cs_managed_kubernetes.this.id
}

output "vpc_id" {
  value = alicloud_vpc.this.id
}

output "kubeconfig_path" {
  value = data.alicloud_cs_cluster_credential.this.output_file
}

output "e2b_domain" {
  value = var.e2b_domain
}
