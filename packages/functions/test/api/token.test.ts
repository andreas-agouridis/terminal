import { describe, expect } from "bun:test";
import { setupApiTest } from "./util";
import { Api } from "@terminal/core/api/api";

const { test, validateOpenAPIRoute } = setupApiTest();

describe("token", () => {
  test("GET /token", async () => {
    const response = await validateOpenAPIRoute("get", "/token");
    expect(response.data).toBeArray();
  });

  test("GET /token/:id", async () => {
    const newToken = await Api.Personal.create();
    const tokenID = newToken.id;
    const response = await validateOpenAPIRoute("get", "/token/:id", {
      id: tokenID,
    });

    expect(response.data).toBeDefined();
    expect(response.data.id).toBe(tokenID);

    await Api.Personal.remove(tokenID);
  });

  test("POST /token", async () => {
    const response = await validateOpenAPIRoute("post", "/token");

    expect(response.data).toBeDefined();
    expect(response.data.id).toBeDefined();
    expect(response.data.token).toBeDefined();
    expect(response.data.token).toMatch(/^trm_/);

    await Api.Personal.remove(response.data.id);
  });

  test("DELETE /token/:id", async () => {
    const newToken = await Api.Personal.create();
    const tokenID = newToken.id;

    await validateOpenAPIRoute("delete", "/token/:id", {
      id: tokenID,
    });

    const deletedToken = await Api.Personal.fromID(tokenID);
    expect(deletedToken).toBeUndefined();
  });
});
