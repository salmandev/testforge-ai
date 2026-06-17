import { describe, it, expect } from "vitest";
import { TestDataGenerator } from "./index.js";
import type { FieldDef, Locale } from "./index.js";

describe("TestDataGenerator", () => {
  let generator: TestDataGenerator;

  beforeEach(() => {
    generator = new TestDataGenerator();
  });

  describe("generate", () => {
    it("should generate the requested number of records", () => {
      const fields: FieldDef[] = [
        { name: "email", type: "email" },
        { name: "name", type: "name" },
      ];

      const records = generator.generate({
        fields,
        locale: "en-US",
        count: 5,
      });

      expect(records.length).toBe(5);
    });

    it("should generate records with all specified fields", () => {
      const fields: FieldDef[] = [
        { name: "email", type: "email" },
        { name: "phone", type: "phone" },
        { name: "name", type: "name" },
      ];

      const records = generator.generate({
        fields,
        locale: "en-US",
        count: 1,
      });

      const record = records[0]!;
      expect(record).toHaveProperty("email");
      expect(record).toHaveProperty("phone");
      expect(record).toHaveProperty("name");
    });
  });

  describe("locale-specific generation", () => {
    it("should generate Saudi mobile numbers for ar-SA", () => {
      const fields: FieldDef[] = [{ name: "phone", type: "phone" }];

      const records = generator.generate({
        fields,
        locale: "ar-SA",
        count: 10,
      });

      for (const record of records) {
        const phone = record.phone as string;
        expect(phone).toMatch(/^05\d{8}$/);
      }
    });

    it("should generate UAE mobile numbers for ar-AE", () => {
      const fields: FieldDef[] = [{ name: "phone", type: "phone" }];

      const records = generator.generate({
        fields,
        locale: "ar-AE",
        count: 5,
      });

      for (const record of records) {
        const phone = record.phone as string;
        expect(phone).toMatch(/^05\d \d{3} \d{4}$/);
      }
    });

    it("should generate US phone numbers for en-US", () => {
      const fields: FieldDef[] = [{ name: "phone", type: "phone" }];

      const records = generator.generate({
        fields,
        locale: "en-US",
        count: 5,
      });

      for (const record of records) {
        const phone = record.phone as string;
        expect(phone).toMatch(/^\([2-9]\d{2}\) \d{3}-\d{4}$/);
      }
    });

    it("should generate Saudi IBAN format for ar-SA", () => {
      const fields: FieldDef[] = [{ name: "iban", type: "IBAN" }];

      const records = generator.generate({
        fields,
        locale: "ar-SA",
        count: 5,
      });

      for (const record of records) {
        const iban = record.iban as string;
        expect(iban).toMatch(/^SA\d{22}$/);
      }
    });
  });

  describe("GCC-specific fields", () => {
    it("should generate Saudi National ID (starts with 1)", () => {
      const fields: FieldDef[] = [{ name: "nationalId", type: "SaudiId" }];

      const records = generator.generate({
        fields,
        locale: "ar-SA",
        count: 10,
      });

      for (const record of records) {
        const id = record.nationalId as string;
        expect(id).toMatch(/^1\d{9}$/);
        expect(id.length).toBe(10);
      }
    });

    it("should generate Iqama numbers (starts with 2)", () => {
      const fields: FieldDef[] = [{ name: "iqama", type: "Iqama" }];

      const records = generator.generate({
        fields,
        locale: "ar-SA",
        count: 10,
      });

      for (const record of records) {
        const iqama = record.iqama as string;
        expect(iqama).toMatch(/^2\d{9}$/);
        expect(iqama.length).toBe(10);
      }
    });

    it("should generate Arabic names for ar-SA", () => {
      const fields: FieldDef[] = [{ name: "name", type: "arabicName" }];

      const records = generator.generate({
        fields,
        locale: "ar-SA",
        count: 5,
      });

      for (const record of records) {
        const name = record.name as string;
        // Arabic text should contain Arabic characters
        expect(name).toMatch(/[\u0600-\u06FF]/);
      }
    });

    it("should generate Saudi cities for ar-SA", () => {
      const fields: FieldDef[] = [{ name: "city", type: "city" }];

      const records = generator.generate({
        fields,
        locale: "ar-SA",
        count: 1,
      });

      const city = records[0]?.city as string;
      expect(["الرياض", "جدة", "الدمام", "مكة", "المدينة", "تبوك"]).toContain(
        city
      );
    });
  });

  describe("standard field types", () => {
    it("should generate valid email addresses", () => {
      const fields: FieldDef[] = [{ name: "email", type: "email" }];

      const records = generator.generate({
        fields,
        locale: "en-US",
        count: 5,
      });

      for (const record of records) {
        const email = record.email as string;
        expect(email).toMatch(/^.+@.+\..+$/);
      }
    });

    it("should generate credit card numbers (16 digits, starting with 4 for Visa)", () => {
      const fields: FieldDef[] = [{ name: "cc", type: "creditCard" }];

      const records = generator.generate({
        fields,
        locale: "en-US",
        count: 5,
      });

      for (const record of records) {
        const cc = record.cc as string;
        expect(cc).toMatch(/^4\d{15}$/);
        expect(cc.length).toBe(16);
      }
    });

    it("should generate passwords with minimum 16 characters", () => {
      const fields: FieldDef[] = [{ name: "password", type: "password" }];

      const records = generator.generate({
        fields,
        locale: "en-US",
        count: 5,
      });

      for (const record of records) {
        const password = record.password as string;
        expect(password.length).toBeGreaterThanOrEqual(16);
      }
    });

    it("should generate usernames", () => {
      const fields: FieldDef[] = [{ name: "username", type: "username" }];

      const records = generator.generate({
        fields,
        locale: "en-US",
        count: 5,
      });

      for (const record of records) {
        const username = record.username as string;
        expect(username.length).toBeGreaterThan(0);
        expect(username).not.toContain(" ");
      }
    });

    it("should generate URLs", () => {
      const fields: FieldDef[] = [{ name: "url", type: "url" }];

      const records = generator.generate({
        fields,
        locale: "en-US",
        count: 3,
      });

      for (const record of records) {
        const url = record.url as string;
        expect(url).toMatch(/^https:\/\/www\..+/);
      }
    });

    it("should generate text with configurable length", () => {
      const fields: FieldDef[] = [
        { name: "short", type: "text", minLength: 3, maxLength: 5 },
        { name: "long", type: "text", minLength: 10, maxLength: 15 },
      ];

      const records = generator.generate({
        fields,
        locale: "en-US",
        count: 5,
      });

      for (const record of records) {
        const short = (record.short as string).split(" ").length;
        const long = (record.long as string).split(" ").length;

        expect(short).toBeGreaterThanOrEqual(3);
        expect(short).toBeLessThanOrEqual(5);
        expect(long).toBeGreaterThanOrEqual(10);
        expect(long).toBeLessThanOrEqual(15);
      }
    });

    it("should generate numbers", () => {
      const fields: FieldDef[] = [{ name: "num", type: "number" }];

      const records = generator.generate({
        fields,
        locale: "en-US",
        count: 5,
      });

      for (const record of records) {
        const num = record.num as number;
        expect(typeof num).toBe("number");
        expect(num).toBeGreaterThanOrEqual(0);
        expect(num).toBeLessThan(10000);
      }
    });
  });

  describe("uniqueness", () => {
    it("should generate different values across records", () => {
      const fields: FieldDef[] = [{ name: "email", type: "email" }];

      const records = generator.generate({
        fields,
        locale: "en-US",
        count: 10,
      });

      const emails = records.map((r) => r.email as string);
      const uniqueEmails = new Set(emails);

      // At least 80% should be unique
      expect(uniqueEmails.size).toBeGreaterThanOrEqual(8);
    });
  });
});
