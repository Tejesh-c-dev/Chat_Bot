import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET || "secret";

export function signToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
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
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true },
    });

    if (!user) {
      return { error: "Invalid token", status: 401 };
    }

    return { userId: decoded.userId };
  } catch {
    return { error: "Invalid token", status: 401 };
  }
}
