# An Express.js API processing and exporting scene files on the server

This demo combines the Node.js CreativeEditor SDK bindings with the CE.SDK Renderer to modify a scene and then export it efficiently with GPU acceleration.

## Running the sample

1. Make sure you've set up [Docker](https://docs.docker.com/engine/install/) or a compatible container engine on your machine.
2. Run `IMGLY_LICENSE=... docker compose up --build` to build and start the Express API gateway
3. Connect to http://localhost:8080/ and upload a scene file in the HTML form to the export of multiple size variants of the scene and get the `.zip` of the variants back.
