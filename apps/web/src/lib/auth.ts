import NextAuth, { NextAuthConfig } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const RegisterSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().optional(),
});

export const authConfig: NextAuthConfig = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            return null;
          }

          const validated = LoginSchema.safeParse({
            email: credentials.email,
            password: credentials.password,
          });

          if (!validated.success) {
            return null;
          }

          const user = await prisma.user.findUnique({
            where: { email: validated.data.email },
          });

          if (!user) {
            return null;
          }

          const isValidPassword = await bcrypt.compare(validated.data.password, user.password);

          if (!isValidPassword) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name || user.email,
          };
        } catch (error) {
          console.error("Auth error:", error);
          return null;
        }
      },
    }),
  ],
  pages: {
    signIn: "/auth/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
  secret: (() => {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      console.error(
        "❌ NEXTAUTH_SECRET is not set in environment variables.\n" +
        "Please add NEXTAUTH_SECRET to your .env.local file in apps/web/\n" +
        "Generate a secret with: openssl rand -base64 32"
      );
      throw new Error(
        "NEXTAUTH_SECRET is required. Please add it to your .env.local file."
      );
    }
    if (secret.length < 32) {
      console.warn(
        "⚠️  NEXTAUTH_SECRET should be at least 32 characters long for security."
      );
    }
    return secret;
  })(),
};

// Export auth function for NextAuth v5
export const { auth, handlers, signIn, signOut } = NextAuth(authConfig);

// Keep authOptions for backward compatibility with route handler
export const authOptions = authConfig;

export async function registerUser(data: z.infer<typeof RegisterSchema>) {
  const validated = RegisterSchema.parse(data);

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: validated.email },
  });

  if (existingUser) {
    throw new Error("User with this email already exists");
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(validated.password, 10);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: validated.email,
      password: hashedPassword,
      name: validated.name,
    },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
    },
  });

  return user;
}
