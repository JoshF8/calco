# Ejemplo 03 — Launch template con ebs_block_device y tag_specifications
# Dos niveles de anidamiento: el recurso lleva bloques, y cada bloque
# lleva sus propios atributos (y tags de mapa no soportado → diagnóstico honesto).

resource "aws_launch_template" "app" {
  name          = "app-lt"
  image_id      = "ami-0abcdef1234567890"
  instance_type = "t3.micro"

  # Los bloques se importan en orden de origen
  network_interfaces {
    associate_public_ip_address = true
    security_groups             = [aws_security_group.web.id]
  }

  ebs_block_device {
    device_name = "/dev/sdf"
    volume_size = 30
    volume_type = "gp3"
  }

  tag_specifications {
    resource_type = "instance"
  }
}

resource "aws_instance" "app" {
  ami                    = aws_launch_template.app.image_id   # ref a .image_id de un recurso
  instance_type          = "t3.micro"
  key_name               = "dev-key"
  vpc_security_group_ids = [aws_security_group.web.id]
}