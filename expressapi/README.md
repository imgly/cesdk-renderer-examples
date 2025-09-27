# A simple Express.js API exporting scene files on the server

## Running the sample

1. Make sure you've set up [Docker](https://docs.docker.com/engine/install/) or a compatible container engine on your machine.
2. Run `IMGLY_LICENSE=... docker compose up --build` to build and start the Express API gateway
3. Connect to http://localhost:8080/ and upload a scene file in the HTML form to trigger a png export and get the image back.
