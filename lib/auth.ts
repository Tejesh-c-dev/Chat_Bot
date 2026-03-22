import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return secret;
}

export function signToken(userId: string): string {
  return jwt.sign({ userId }, getJwtSecret(), { expiresIn: "7d" });
}

export async function getAuthenticatedUserId(request: NextRequest): Promise<
  | { userId: string }
  | {
      error: string;
      status: number;
    }
> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { error: "No token provided", status: 401 };
  }

  const token = authHeader.split(" ")[1];
  if (!token || token === "null" || token === "undefined") {
    return { error: "No token provided", status: 401 };
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true },
    });

    if (!user) {
      return { error: "Invalid token", status: 401 };
    }

    return { userId: decoded.userId };
  } catch (error) {
    if (error instanceof Error && error.message.includes("JWT_SECRET")) {
      return { error: "Server auth is not configured", status: 500 };
    }

    return { error: "Invalid token", status: 401 };
  }
}
