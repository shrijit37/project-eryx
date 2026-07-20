import { Prisma, prisma, type User } from "@project-eryx/db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

//types
import type { ControllerResult } from "./auth.validation";
import type { RegisterReqData, LoginReqData } from "./auth.validation";

export const handleRegister = async (
  data: RegisterReqData,
): Promise<ControllerResult> => {
  try {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      return {
        success: false,
        message: "User with this email already exists",
        data: null,
        statusCode: 409,
        token: null,
      };
    }

    const user: User = await prisma.user.create({
      data: {
        email: data.email,
        password_hash: hashedPassword,
        username: data.username,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    const { password_hash, ...userWithoutPassword } = user;

    return {
      success: true,
      message: "User created successfully",
      data: userWithoutPassword,
      statusCode: 201,
      token: null,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        success: false,
        message: "User with this email already exists",
        data: null,
        statusCode: 409,
        token: null,
      };
    }
    console.error("Error creating user:", error);
    return {
      success: false,
      message: "Failed to create user",
      data: null,
      statusCode: 500,
      token: null,
    };
  }
};

export const handleLogin = async (
  data: LoginReqData,
): Promise<ControllerResult> => {
  try {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (!user) {
      return {
        success: false,
        message: "User not found",
        data: null,
        statusCode: 404,
        token: null,
      };
    }
    const isPasswordValid = await bcrypt.compare(
      data.password,
      user.password_hash,
    );
    if (!isPasswordValid) {
      return {
        success: false,
        message: "Invalid password",
        data: null,
        statusCode: 401,
        token: null,
      };
    }
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: "1h",
    });
    const { password_hash, ...userWithoutPassword } = user;
    return {
      success: true,
      message: "User found",
      data: userWithoutPassword,
      statusCode: 200,
      token: token,
    };
  } catch (error) {
    console.error("Error logging in user:", error);
    return {
      success: false,
      message: "Failed to login user",
      data: null,
      statusCode: 500,
      token: null,
    };
  }
};
