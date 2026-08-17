# Ejemplo 05 — dynamic blocks: se diagnostican honestamente (no se adivinan)
# dynamic lleva un label ("ingress") y contenido generado con for_each.
# Nuestro Block no modela labels todavía → diagnóstico claro, no pérdida silenciosa.

resource "aws_security_group" "multi" {
  name        = "multi-rule-sg"
  description = "Rules driven by a list variable"
  vpc_id      = aws_vpc.main.id

  dynamic "ingress" {
    for_each = var.ingress_rules
    content {
      from_port   = ingress.value.from_port
      to_port     = ingress.value.to_port
      protocol    = ingress.value.protocol
      cidr_blocks = ingress.value.cidr_blocks
    }
  }
}

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

variable "ingress_rules" {
  description = "List of ingress rules to create"
  type = list(object({
    from_port   = number
    to_port     = number
    protocol    = string
    cidr_blocks = list(string)
  }))
  default = []
}