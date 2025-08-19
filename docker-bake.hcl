# Describes docker containers for the IMG.LY commandline processor
# To run a build, execute:
# [Linux]
# poetry run ./build.py x86_64-ubuntu-linux Release Ninja "-o jni=False -o targets=cesdk_cli" config/conan/profiles/x86_64-ubuntu-linux
# [Mac]
# docker compose run imgly-ci-emulator bash -c 'poetry install && poetry run ./build.py x86_64-ubuntu-linux Release Ninja "-o jni=False -o targets=cesdk_cli" config/conan/profiles/x86_64-ubuntu-linux'
# [Everywhere]
# UBQ_VERSION="$(cat ../../.ubq-version)" UBQ_BUILD_TYPE=Release TAG=latest docker buildx bake --allow=fs.read=../.. --file=./docker-bake.hcl [--no-cache] [--push] [TARGET]

variable "UBQ_BUILD_TYPE" {
  default = "Release"
}

variable "UBQ_VERSION" {
  default = "unset"
}

variable "TAG" {
  default = "development"
}

group "default" {
  targets = [
    "gpu-base",
    "processor-assetless",
    "processor",
  ]
}

target "gpu-base" {
  context = "../../"
  dockerfile = "apps/imgly_processor/Dockerfile.gpu-base"
  platforms = ["linux/amd64"]
  tags = ["docker.io/imgly/imgly-processor-gpu-base:${TAG}"]
}

target "processor-assetless" {
  context = "../../"
  dockerfile = "apps/imgly_processor/Dockerfile.processor-assetless"
  platforms = ["linux/amd64"]
  contexts = {
    "imgly-processor-gpu-base" = "target:gpu-base"
  }
  args = {
    "UBQ_BUILD_TYPE" = "${UBQ_BUILD_TYPE}",
    "UBQ_VERSION" = "${UBQ_VERSION}",
  }
  tags = ["docker.io/imgly/imgly-processor-assetless:${TAG}"]
}

target "processor" {
  context = "../../"
  dockerfile = "apps/imgly_processor/Dockerfile.processor"
  platforms = ["linux/amd64"]
  contexts = {
    "imgly-processor-assetless" = "target:processor-assetless"
  }
  args = {
    "UBQ_BUILD_TYPE" = "${UBQ_BUILD_TYPE}",
    "UBQ_VERSION" = "${UBQ_VERSION}",
  }
  tags = ["docker.io/imgly/imgly-processor:${TAG}"]
}
