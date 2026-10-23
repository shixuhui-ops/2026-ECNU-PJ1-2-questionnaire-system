const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const frontendRoot = path.resolve(__dirname, "../../frontend");
const port = Number(process.env.TEST_FRONTEND_PORT || 5501);

const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8"
};

const server = http.createServer((req, res) => {
    const requestPath = decodeURIComponent(
        new URL(req.url, `http://${req.headers.host}`).pathname
    );
    const relativePath =
        requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
    const filePath = path.resolve(frontendRoot, relativePath);
    const relative = path.relative(frontendRoot, filePath);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(error.code === "ENOENT" ? 404 : 500);
            res.end(error.code === "ENOENT" ? "Not Found" : "Server Error");
            return;
        }

        res.writeHead(200, {
            "Content-Type":
                contentTypes[path.extname(filePath)] ||
                "application/octet-stream"
        });
        res.end(content);
    });
});

server.listen(port, "127.0.0.1", () => {
    console.log(`测试前端已启动：http://127.0.0.1:${port}`);
});