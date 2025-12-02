const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// Serve all static files in current folder
app.use(express.static(__dirname));

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
