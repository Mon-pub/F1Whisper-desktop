# libthreema

`libthreema` is an implementation of the Threema protocol, shared by all official Threema clients.
Its development is ongoing, and it is the responsibility of the clients to update and integrate new
`libthreema` versions whenever it is updated.

## Setup

Clone the repo from our internal page. It is recommended to build it at least once within the
original repo to make sure everything works fine by simply running `./tools/build-wasm.sh`. Note
that builds are run in a dev container, so Docker is a required dependency.
