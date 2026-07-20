import z from 'zod';


const LoginReqSchema = z.object({
    email: z.email(),
    password: z.string().min(8).max(32),
});

const RegisterReqSchema = z.object({
    email: z.email(),
    password: z.string().min(8).max(32),
    username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
})

interface ControllerResult<T = unknown> {
  success: boolean;
  message: string;
  data: T;
  statusCode: number;
}

type LoginReqData = z.infer<typeof LoginReqSchema>;
type RegisterReqData = z.infer<typeof RegisterReqSchema>;

export {LoginReqSchema, RegisterReqSchema, type ControllerResult, type LoginReqData, type RegisterReqData};
