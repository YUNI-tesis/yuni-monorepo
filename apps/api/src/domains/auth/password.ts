import bcrypt from "bcryptjs";

export type PasswordService = {
  hash(password: string): Promise<string>;
  verify(password: string, passwordHash: string): Promise<boolean>;
};

export const passwordService: PasswordService = {
  hash(password: string) {
    return bcrypt.hash(password, 10);
  },

  verify(password: string, passwordHash: string) {
    return bcrypt.compare(password, passwordHash);
  },
};
