import reqContext from "@fastify/request-context";
import "dotenv/config";
import axios from "axios";
import cors from "@fastify/cors";
import OpenAI from "openai";
import Fastify from "fastify";
import prisma from "./prisma";
import fastifyJwt from "@fastify/jwt";
import { User } from "./interfaces";

const server = Fastify({
  logger: true,
});

server.register(reqContext);

server.register(cors, {
  // allowedHeaders: "*",
  // TODO: CHANGE IN PRODUCTION TO PUBLIC WEBSITE URL
  allowedHeaders: "modeltunerai.com",
});

const UNAUTHENTICATED_PATHS: any = {
  "/loginWithGoogle": true,
};
// to CHECK AUTH and send away if not

server.addHook("onRequest", async (req, reply) => {
  // path doesn't require authenticated so continue
  if (UNAUTHENTICATED_PATHS[req.routeOptions.url]) return;

  const jwt = req.headers?.authorization?.replace("Bearer ", "");

  // user didn't pass in auth header
  if (!jwt) reply.status(401).send({ error: `Unauthenticated user.` });

  const { email } = (await server.jwt.decode(jwt as string)) as any;
  const user = await prisma.user.findFirst({
    where: { email },
  });

  // set user on context
  if (user) {
    // @ts-expect-error
    req.requestContext.set("user", user);
  }
});

// for signing JWT tokens in auth
server.register(fastifyJwt, {
  secret: process.env.JWT_SECRET as string,
  sign: { expiresIn: "24h" },
});

server.get("/", async function handler(request, reply) {
  return { hello: "world" };
});

// ROUTE: to get a user's current session data
server.get(`/session`, async (req, reply) => {
  // @ts-expect-error
  const user = req.requestContext.get("user");

  return { user };
});

// ROUTE: will either create user, or log into user and send back JWT
server.post(`/loginWithGoogle`, async (req, reply) => {
  const { name, email, picture } = JSON.parse(req.body as string);

  // user already exists
  let user = await prisma.user.findFirst({ where: { email } });
  const firstTimeSignIn = Boolean(!user);

  // user isn't registered
  if (!user) {
    user = await prisma.user.create({ data: { email, name, picture } });
  }

  const jwt = server.jwt.sign({
    email: user.email,
  });

  return { jwt, firstTimeSignIn };
});

// ROUTE: returns list of files uploaded given an API key
server.get(`/listFiles`, async (req, reply) => {
  // @ts-expect-error
  const user: User = req.requestContext.get("user" as never) as User;

  const getAllFilesUploaded = await axios.get(
    `https://api.openai.com/v1/files`,
    {
      headers: { Authorization: `Bearer ${user?.openAiApiKey}` },
    }
  );
  const allFilesUploaded = await getAllFilesUploaded.data.data;

  return { files: allFilesUploaded };
});

// ROUTE: uploading files to OpenAI
server.post(`/uploadFileToOpenAI`, async (req, reply) => {
  try {
    const {
      trainingData,
      datasetName,
    }: { trainingData: string; datasetName: string } = JSON.parse(
      req.body as string
    );

    let fileblob = new Blob([trainingData], {
      type: "text/plain; charset=utf8",
    });

    let body = new FormData();

    body.append("purpose", "fine-tune");

    // is custom training data (so it will already have .jsonl extension)
    if (datasetName.includes(".jsonl")) {
      body.append("file", fileblob, datasetName);
    } else {
      body.append(
        "file",
        fileblob,
        `${datasetName.replace(".json", "")}.jsonl`
      );
    }

    // TODO: if we want to write to project and see the training data in action
    // fs.writeFile(
    //   `${datasetName}.jsonl`,

    //   trainingData,
    //   (err) => console.log(err)
    // );

    // @ts-expect-error
    const user: User = req.requestContext.get("user" as never) as User;

    // create openai instance when uploading so we can get proper error message

    const openaiApi = new OpenAI({ apiKey: user?.openAiApiKey as string });

    const upload = await openaiApi.files.create({
      // @ts-expect-error
      file: body.get("file"),
      // @ts-expect-error
      purpose: body.get("purpose"),
    });

    // WITH HTTP API
    // const upload = await axios.post("https://api.openai.com/v1/files", body, {
    //   headers: {
    //     Authorization: `Bearer ${user?.openAiApiKey}`,
    //     "Content-Type": "text/plain",
    //   },
    // });

    return upload;
  } catch (error) {
    console.error("Error on upload file:", error);
    // @ts-ignore
    return reply.status(500).send({ error: error.message });
  }
});

// ROUTE:
server.delete(`/deleteFile`, async (req, reply) => {
  //@ts-expect-error
  const { id } = req.query;

  // @ts-expect-error
  const user: User = req.requestContext.get("user" as never) as User;

  const deleteFile = await axios.delete(
    `https://api.openai.com/v1/files/${id}`,
    {
      headers: { Authorization: `Bearer ${user?.openAiApiKey}` },
    }
  );

  const deleteFileResponse = deleteFile.data;

  return deleteFileResponse;
});

// ROUTE:
server.get(`/listModels`, async (req, reply) => {
  // @ts-expect-error
  const user: User = req.requestContext.get("user" as never) as User;

  const listModels = await axios.get(`https://api.openai.com/v1/models`, {
    headers: { Authorization: `Bearer ${user?.openAiApiKey}` },
  });

  const models = listModels.data.data;

  return { models };
});

server.post(`/saveApiKey`, async (req, reply) => {
  const { apiKey } = JSON.parse(req.body as string);

  // @ts-expect-error
  const user: User = req.requestContext.get("user" as never) as User;

  const updateApiKey = await prisma.user.update({
    where: { email: user.email },
    data: { openAiApiKey: apiKey },
  });

  return { success: true };
});

server.get(`/getFile`, async (req, reply) => {
  // @ts-expect-error
  const user: User = req.requestContext.get("user" as never) as User;

  const { id }: any = req.query;
  const fileID = id as string;
  const file = await axios.get(`https://api.openai.com/v1/files/${fileID}`, {
    headers: { Authorization: `Bearer ${user?.openAiApiKey}` },
  });

  return { file: file.data };
});

server.post(`/createFinetune`, async (req, reply) => {
  const { fileId, n_epochs } = JSON.parse(req.body as string);
  try {
    // @ts-expect-error
    const user: User = req.requestContext.get("user" as never) as User;

    const openaiApi = new OpenAI({ apiKey: user?.openAiApiKey as string });

    // start creating finetune job
    const startJob = await openaiApi.fineTuning.jobs.create({
      model: "gpt-3.5-turbo",
      training_file: fileId,
      // default to 3 if it wasn't passed in
      hyperparameters: { n_epochs: n_epochs || 3 },
    });

    const jobData = startJob;

    console.log(`JOB DATA:`, jobData);
    return { job: jobData };
  } catch (err) {
    // @ts-expect-error
    return reply.status(err?.status || 400).send(err);
  }
});

server.get(`/finetuneJobs`, async (req, reply) => {
  // @ts-expect-error
  const user: User = req.requestContext.get("user" as never) as User;

  const getJobs = await axios.get(
    `https://api.openai.com/v1/fine_tuning/jobs`,
    { headers: { Authorization: `Bearer ${user?.openAiApiKey}` } }
  );

  const jobs = getJobs.data;

  return { jobs };
});

server.get(`/getFileContent`, async (req, reply) => {
  // @ts-expect-error
  const { id } = req.query;

  // @ts-expect-error
  const user: User = req.requestContext.get("user" as never) as User;

  const getFileContent = await axios.get(
    `https://api.openai.com/v1/files/${id}/content`,
    { headers: { Authorization: `Bearer ${user?.openAiApiKey}` } }
  );

  const fileContent = getFileContent.data;

  return { fileContent };
});

server.delete(`/deleteModel`, async (req, reply) => {
  // @ts-expect-error
  const { id } = req.query;

  // @ts-expect-error
  const user: User = req.requestContext.get("user" as never) as User;

  const openaiApi = new OpenAI({ apiKey: user?.openAiApiKey as string });

  const model = await openaiApi.models.del(id);

  return model;
});

server.post(`/testApiKey`, async (req, reply) => {
  // @ts-expect-error
  const user: User = req.requestContext.get("user" as never) as User;

  const { apiKey } = JSON.parse(req.body as string);

  const openaiApi = new OpenAI({ apiKey });

  const response = await openaiApi.models.list();

  // @ts-expect-error
  if (!response.error) {
    await prisma.user.update({
      data: { openAiApiKey: apiKey },
      where: { email: user?.email },
    });
  }

  return response;

  //
});

// Run the server!
// @ts-expect-error
server.listen({ port: process.env.PORT || 4000, host: "0.0.0.0" });
