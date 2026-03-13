# Docker image for building the Threema Desktop developer documentation.

ARG DEBIAN_VERSION
ARG MDBOOK_PLANTUML_VERSION
ARG MDBOOK_VERSION
ARG PLANTUML_VERSION
ARG RUST_VERSION

FROM rust:${RUST_VERSION}-slim-bookworm AS builder

ARG MDBOOK_VERSION
ARG MDBOOK_PLANTUML_VERSION

ENV CARGO_TARGET_DIR=/usr/local/cargo-target

RUN cargo install mdbook --version "${MDBOOK_VERSION}" \
 && cargo install mdbook-plantuml --version "${MDBOOK_PLANTUML_VERSION}" \
 && strip /usr/local/cargo/bin/mdbook \
 && strip /usr/local/cargo/bin/mdbook-plantuml

FROM docker.io/debian:${DEBIAN_VERSION}

ARG PLANTUML_VERSION

# Install runtime dependencies:
#   default-jre-headless — Java runtime required by PlantUML
#   git                  — required by the GitLab CI runner when GIT_STRATEGY=clone
#
# Note: we intentionally do NOT use the Debian 'plantuml' package — it ships
# version 1.2020.2 (frozen since 2020) which is missing 6+ years of syntax
# features and causes parse errors on modern diagrams. We download the official
# JAR directly from GitHub releases instead.
RUN apt-get update \
 && apt-get install --no-install-recommends -y \
      curl \
      default-jre-headless \
      git \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL \
      "https://github.com/plantuml/plantuml/releases/download/v${PLANTUML_VERSION}/plantuml-${PLANTUML_VERSION}.jar" \
      -o /usr/local/lib/plantuml.jar

COPY --from=builder /usr/local/cargo/bin/mdbook          /usr/local/bin/mdbook
COPY --from=builder /usr/local/cargo/bin/mdbook-plantuml /usr/local/bin/mdbook-plantuml
