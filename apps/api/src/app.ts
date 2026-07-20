import express from "express";
import authRouter from "./modules/auth/auth.routes";


const app = express();
const PORT = 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use("/api/auth", authRouter);
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

