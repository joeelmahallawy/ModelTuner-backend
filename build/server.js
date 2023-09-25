"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const request_context_1 = tslib_1.__importDefault(
  require("@fastify/request-context")
);
require("dotenv/config");
const axios_1 = tslib_1.__importDefault(require("axios"));
const cors_1 = tslib_1.__importDefault(require("@fastify/cors"));
const openai_1 = tslib_1.__importDefault(require("openai"));
const fastify_1 = tslib_1.__importDefault(require("fastify"));
const prisma_1 = tslib_1.__importDefault(require("./prisma"));
const jwt_1 = tslib_1.__importDefault(require("@fastify/jwt"));
const server = (0, fastify_1.default)({
  logger: true,
});
server.register(request_context_1.default);
server.register(cors_1.default, {
  allowedHeaders: "*",
});
const UNAUTHENTICATED_PATHS = {
  "/loginWithGoogle": true,
};
server.addHook("onRequest", (req, reply) =>
  tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    if (UNAUTHENTICATED_PATHS[req.routeOptions.url]) return;
    const jwt =
      (_b =
        (_a = req.headers) === null || _a === void 0
          ? void 0
          : _a.authorization) === null || _b === void 0
        ? void 0
        : _b.replace("Bearer ", "");
    if (!jwt) reply.status(401).send({ error: `Unauthenticated user.` });
    const { email } = yield server.jwt.decode(jwt);
    const user = yield prisma_1.default.user.findFirst({
      where: { email },
    });
    if (user) {
      req.requestContext.set("user", user);
    }
  })
);
server.register(jwt_1.default, {
  secret: process.env.JWT_SECRET,
  sign: { expiresIn: "24h" },
});
server.get("/", function handler(request, reply) {
  return tslib_1.__awaiter(this, void 0, void 0, function* () {
    return { hello: "world" };
  });
});
server.get(`/session`, (req, reply) =>
  tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const user = req.requestContext.get("user");
    return { user };
  })
);
server.post(`/loginWithGoogle`, (req, reply) =>
  tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const { name, email, picture } = JSON.parse(req.body);
    let user = yield prisma_1.default.user.findFirst({ where: { email } });
    const firstTimeSignIn = Boolean(!user);
    if (!user) {
      user = yield prisma_1.default.user.create({
        data: { email, name, picture },
      });
    }
    const jwt = server.jwt.sign({
      email: user.email,
    });
    return { jwt, firstTimeSignIn };
  })
);
server.get(`/listFiles`, (req, reply) =>
  tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const user = req.requestContext.get("user");
    const getAllFilesUploaded = yield axios_1.default.get(
      `https://api.openai.com/v1/files`,
      {
        headers: {
          Authorization: `Bearer ${
            user === null || user === void 0 ? void 0 : user.openAiApiKey
          }`,
        },
      }
    );
    const allFilesUploaded = yield getAllFilesUploaded.data.data;
    return { files: allFilesUploaded };
  })
);
server.post(`/uploadFileToOpenAI`, (req, reply) =>
  tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    try {
      const { trainingData, datasetName } = JSON.parse(req.body);
      let fileblob = new Blob([trainingData], {
        type: "text/plain; charset=utf8",
      });
      let body = new FormData();
      body.append("purpose", "fine-tune");
      if (datasetName.includes(".jsonl")) {
        body.append("file", fileblob, datasetName);
      } else {
        body.append(
          "file",
          fileblob,
          `${datasetName.replace(".json", "")}.jsonl`
        );
      }
      const user = req.requestContext.get("user");
      const openaiApi = new openai_1.default({
        apiKey: user === null || user === void 0 ? void 0 : user.openAiApiKey,
      });
      const upload = yield openaiApi.files.create({
        file: body.get("file"),
        purpose: body.get("purpose"),
      });
      return upload;
    } catch (error) {
      console.error("Error on upload file:", error);
      return reply.status(500).send({ error: error.message });
    }
  })
);
server.delete(`/deleteFile`, (req, reply) =>
  tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.query;
    const user = req.requestContext.get("user");
    const deleteFile = yield axios_1.default.delete(
      `https://api.openai.com/v1/files/${id}`,
      {
        headers: {
          Authorization: `Bearer ${
            user === null || user === void 0 ? void 0 : user.openAiApiKey
          }`,
        },
      }
    );
    const deleteFileResponse = deleteFile.data;
    return deleteFileResponse;
  })
);
server.get(`/listModels`, (req, reply) =>
  tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const user = req.requestContext.get("user");
    const listModels = yield axios_1.default.get(
      `https://api.openai.com/v1/models`,
      {
        headers: {
          Authorization: `Bearer ${
            user === null || user === void 0 ? void 0 : user.openAiApiKey
          }`,
        },
      }
    );
    const models = listModels.data.data;
    return { models };
  })
);
server.post(`/saveApiKey`, (req, reply) =>
  tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const { apiKey } = JSON.parse(req.body);
    const user = req.requestContext.get("user");
    const updateApiKey = yield prisma_1.default.user.update({
      where: { email: user.email },
      data: { openAiApiKey: apiKey },
    });
    return { success: true };
  })
);
server.get(`/getFile`, (req, reply) =>
  tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const user = req.requestContext.get("user");
    const { id } = req.query;
    const fileID = id;
    const file = yield axios_1.default.get(
      `https://api.openai.com/v1/files/${fileID}`,
      {
        headers: {
          Authorization: `Bearer ${
            user === null || user === void 0 ? void 0 : user.openAiApiKey
          }`,
        },
      }
    );
    return { file: file.data };
  })
);
server.post(`/createFinetune`, (req, reply) =>
  tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const { fileId, n_epochs } = JSON.parse(req.body);
    try {
      const user = req.requestContext.get("user");
      const openaiApi = new openai_1.default({
        apiKey: user === null || user === void 0 ? void 0 : user.openAiApiKey,
      });
      const startJob = yield openaiApi.fineTuning.jobs.create({
        model: "gpt-3.5-turbo",
        training_file: fileId,
        hyperparameters: { n_epochs: n_epochs || 3 },
      });
      const jobData = startJob;
      console.log(`JOB DATA:`, jobData);
      return { job: jobData };
    } catch (err) {
      return reply
        .status((err === null || err === void 0 ? void 0 : err.status) || 400)
        .send(err);
    }
  })
);
server.get(`/finetuneJobs`, (req, reply) =>
  tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const user = req.requestContext.get("user");
    const getJobs = yield axios_1.default.get(
      `https://api.openai.com/v1/fine_tuning/jobs`,
      {
        headers: {
          Authorization: `Bearer ${
            user === null || user === void 0 ? void 0 : user.openAiApiKey
          }`,
        },
      }
    );
    const jobs = getJobs.data;
    return { jobs };
  })
);
server.get(`/getFileContent`, (req, reply) =>
  tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.query;
    const user = req.requestContext.get("user");
    const getFileContent = yield axios_1.default.get(
      `https://api.openai.com/v1/files/${id}/content`,
      {
        headers: {
          Authorization: `Bearer ${
            user === null || user === void 0 ? void 0 : user.openAiApiKey
          }`,
        },
      }
    );
    const fileContent = getFileContent.data;
    return { fileContent };
  })
);
server.delete(`/deleteModel`, (req, reply) =>
  tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.query;
    const user = req.requestContext.get("user");
    const openaiApi = new openai_1.default({
      apiKey: user === null || user === void 0 ? void 0 : user.openAiApiKey,
    });
    const model = yield openaiApi.models.del(id);
    return model;
  })
);
server.post(`/testApiKey`, (req, reply) =>
  tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const user = req.requestContext.get("user");
    const { apiKey } = JSON.parse(req.body);
    const openaiApi = new openai_1.default({ apiKey });
    const response = yield openaiApi.models.list();
    if (!response.error) {
      yield prisma_1.default.user.update({
        data: { openAiApiKey: apiKey },
        where: {
          email: user === null || user === void 0 ? void 0 : user.email,
        },
      });
    }
    return response;
  })
);
server.listen({ port: process.env.PORT || 4000 });
//# sourceMappingURL=server.js.map
