import { prisma, type User } from "@project-eryx/db";
import bcrypt from "bcrypt";

//types
import type { ControllerResult } from "./auth.validation";
import type { RegisterReqData } from "./auth.validation";

export const handleRegister = async (
  data: RegisterReqData,
): Promise<ControllerResult> => {
  try {
    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user: User = await prisma.user.create({
      data: {
        email: data.email,
        password_hash: hashedPassword,
        username: data.username,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    return {
      success: true,
      message: "User created successfully",
      data: user,
      statusCode: 201,
    };
  } catch (error) {
    console.error("Error creating user:", error);
    return {
      success: false,
      message: "Failed to create user",
      data: null,
      statusCode: 500,
    };
  }
};

export const handleLogin = async () => {
  return;
};
