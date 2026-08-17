# Ejemplo 04 — EKS: cluster con vpc_config y node group anidado
# Muestra bloques con refs dentro (subnet_ids) y un bloque NODE dentro
# de un módulo de entidad compuesta, más sub-bloques (scaling_config).

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" "a" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
}

resource "aws_subnet" "b" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.2.0/24"
}

resource "aws_eks_cluster" "main" {
  name     = "calco-demo"
  role_arn = "arn:aws:iam::123456789012:role/eks-cluster-role"
  version  = "1.30"

  vpc_config {
    subnet_ids         = [aws_subnet.a.id, aws_subnet.b.id]
    endpoint_public    = true
    public_access_cidrs = ["0.0.0.0/0"]
  }
}

resource "aws_eks_node_group" "workers" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "workers"
  node_role_arn   = "arn:aws:iam::123456789012:role/eks-node-role"
  subnet_ids      = [aws_subnet.a.id, aws_subnet.b.id]

  scaling_config {
    desired_size = 2
    max_size     = 6
    min_size     = 1
  }
}