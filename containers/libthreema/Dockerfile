# When changing this file, make sure to update the operations/dockerfiles
# repository before pushing it, so that the CI can apply it!

ARG DEBIAN_VERSION
FROM debian:${DEBIAN_VERSION}

# Update apt cache and install dependencies
RUN apt-get update \
 && DEBIAN_FRONTEND="noninteractive" apt-get install -y --no-install-recommends \
    apt-utils \
    bash-completion \
    build-essential \
    ca-certificates \
    clang-format \
    curl \
    git \
    npm \
    less \
    libssl-dev \
    pkg-config \
    procps \
    protobuf-compiler \
 && rm -rf /var/lib/apt/lists/*

# Install wasm-opt directly from binaryen release
ARG BINARYEN_VERSION
RUN binaryen_archive="binaryen-version_${BINARYEN_VERSION}-$(uname -m)-linux.tar.gz" \
 && curl --proto '=https' --tlsv1.3 -OLSsf \
    "https://github.com/WebAssembly/binaryen/releases/download/version_${BINARYEN_VERSION}/${binaryen_archive}" \
 && tar -zxf ${binaryen_archive} \
 && mv binaryen-version_${BINARYEN_VERSION}/bin/wasm-opt /bin/ \
 && rm -rf ${binaryen_archive} binaryen-version_${BINARYEN_VERSION}/

# Add user
ARG USER_UID=1000
ARG USER_GID=1000
ARG USER_NAME=threema
RUN groupadd -g $USER_GID -o $USER_NAME \
 && useradd -l -m -u $USER_UID -g $USER_GID -o -s /bin/bash $USER_NAME \
 && cp /etc/skel/.bashrc /home/$USER_NAME/.bashrc
USER threema

# Install Rust and prevent it from self-updating or installing missing
# toolchains.
#
# Note: We need nightly for rustc, rustfmt and clippy since many useful linters
# are _unstable_. We also need it for cargo-expand.
ARG RUST_VERSION
RUN curl --proto '=https' --tlsv1.3 -sSf "https://sh.rustup.rs" \
  | sh -s -- --default-toolchain ${RUST_VERSION} --component rust-src -y
ENV PATH="/home/${USER_NAME}/.cargo/bin:${PATH}"
RUN rustup set auto-self-update disable \
 && rustup set auto-install disable \
 && cargo install --locked cargo-audit \
 && cargo install --locked cargo-expand \
 && rustup toolchain install nightly --component rustfmt

# Install Rust WASM dependencies
ARG WASM_BINDGEN_VERSION
RUN rustup target add wasm32-unknown-unknown \
 && cargo install --locked wasm-bindgen-cli --version ${WASM_BINDGEN_VERSION}

# Entrypoint
CMD /bin/bash
