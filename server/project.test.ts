import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock database functions
vi.mock("./db", () => ({
  createProject: vi.fn().mockResolvedValue(1),
  getProjectById: vi.fn(),
  getProjectsByUserId: vi.fn().mockResolvedValue([]),
  updateProject: vi.fn().mockResolvedValue(undefined),
  deleteProject: vi.fn().mockResolvedValue(undefined),
  createAgentExecution: vi.fn().mockResolvedValue(1),
  getAgentExecutionsByProjectId: vi.fn().mockResolvedValue([]),
  getBudgetItemsByProjectId: vi.fn().mockResolvedValue([]),
  getLogisticsCostsByProjectId: vi.fn().mockResolvedValue([]),
  getScheduleItemsByProjectId: vi.fn().mockResolvedValue([]),
  getCashFlowItemsByProjectId: vi.fn().mockResolvedValue([]),
  getGeneratedDocumentsByProjectId: vi.fn().mockResolvedValue([]),
}));

import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-123",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("project.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new project with valid input", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.project.create({
      name: "Reforma Posto Shell",
      description: "Reforma completa do posto",
      contractType: "obra",
      location: "São Paulo - SP",
      restrictions: "Trabalho noturno",
      memorialDescritivo: "1. Demolição de piso\n2. Instalação elétrica",
    });

    expect(result).toEqual({ projectId: 1 });
    expect(db.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        name: "Reforma Posto Shell",
        contractType: "obra",
        status: "draft",
      })
    );
    // Should create 9 agent executions
    expect(db.createAgentExecution).toHaveBeenCalledTimes(9);
  });

  it("creates project with minimal required fields", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.project.create({
      name: "Projeto Simples",
      contractType: "manutencao",
    });

    expect(result).toEqual({ projectId: 1 });
    expect(db.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Projeto Simples",
        contractType: "manutencao",
      })
    );
  });

  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.project.create({
        name: "Test Project",
        contractType: "obra",
      })
    ).rejects.toThrow();
  });
});

describe("project.list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user projects", async () => {
    const mockProjects = [
      {
        id: 1,
        userId: 1,
        name: "Project 1",
        status: "draft",
        contractType: "obra",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        userId: 1,
        name: "Project 2",
        status: "approved",
        contractType: "manutencao",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    vi.mocked(db.getProjectsByUserId).mockResolvedValueOnce(mockProjects as any);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.project.list();

    expect(result).toHaveLength(2);
    expect(db.getProjectsByUserId).toHaveBeenCalledWith(1);
  });
});

describe("project.get", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns project by id for owner", async () => {
    const mockProject = {
      id: 1,
      userId: 1,
      name: "Test Project",
      status: "draft",
      contractType: "obra",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(db.getProjectById).mockResolvedValueOnce(mockProject as any);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.project.get({ id: 1 });

    expect(result.name).toBe("Test Project");
  });

  it("throws NOT_FOUND for non-existent project", async () => {
    vi.mocked(db.getProjectById).mockResolvedValueOnce(undefined);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.project.get({ id: 999 })).rejects.toThrow("Projeto não encontrado");
  });

  it("throws FORBIDDEN for non-owner", async () => {
    const mockProject = {
      id: 1,
      userId: 999, // Different user
      name: "Other User Project",
      status: "draft",
      contractType: "obra",
    };

    vi.mocked(db.getProjectById).mockResolvedValueOnce(mockProject as any);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.project.get({ id: 1 })).rejects.toThrow("FORBIDDEN");
  });
});

describe("project.getDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns full project details with all related data", async () => {
    const mockProject = {
      id: 1,
      userId: 1,
      name: "Test Project",
      status: "processing",
      contractType: "obra",
    };

    const mockExecutions = [
      { id: 1, projectId: 1, agentType: "engenheiro_tecnico", status: "completed" },
      { id: 2, projectId: 1, agentType: "logistica", status: "pending" },
    ];

    vi.mocked(db.getProjectById).mockResolvedValueOnce(mockProject as any);
    vi.mocked(db.getAgentExecutionsByProjectId).mockResolvedValueOnce(mockExecutions as any);
    vi.mocked(db.getBudgetItemsByProjectId).mockResolvedValueOnce([]);
    vi.mocked(db.getLogisticsCostsByProjectId).mockResolvedValueOnce([]);
    vi.mocked(db.getScheduleItemsByProjectId).mockResolvedValueOnce([]);
    vi.mocked(db.getCashFlowItemsByProjectId).mockResolvedValueOnce([]);
    vi.mocked(db.getGeneratedDocumentsByProjectId).mockResolvedValueOnce([]);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.project.getDetails({ id: 1 });

    expect(result.project.name).toBe("Test Project");
    expect(result.agentExecutions).toHaveLength(2);
    expect(result.budgetItems).toEqual([]);
  });
});

describe("agent.list", () => {
  it("returns all 9 agents with correct info", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.agent.list();

    expect(result).toHaveLength(9);
    expect(result[0]).toMatchObject({
      type: "engenheiro_tecnico",
      order: 1,
      name: "Engenheiro Técnico",
    });
    expect(result[8]).toMatchObject({
      type: "board",
      order: 9,
      name: "Board de Aprovação",
    });
  });
});
