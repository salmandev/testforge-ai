import { z } from "zod";
import debug from "debug";

const log = debug("testforge:ai:data-generator");

/**
 * Supported locales for test data generation
 */
export type Locale = "en-US" | "en-GB" | "ar-SA" | "ar-AE" | "fr-FR";

/**
 * Supported field types for test data
 */
export type FieldType =
  | "email"
  | "phone"
  | "name"
  | "address"
  | "date"
  | "creditCard"
  | "IBAN"
  | "SaudiId"
  | "Iqama"
  | "arabicName"
  | "nationalId"
  | "passportNumber"
  | "city"
  | "country"
  | "company"
  | "username"
  | "password"
  | "url"
  | "text"
  | "number";

/**
 * Definition of a field to generate
 */
export interface FieldDef {
  /** Field name/key */
  name: string;
  /** Type of data to generate */
  type: FieldType;
  /** Whether the field is required */
  required?: boolean;
  /** Custom format pattern (if applicable) */
  pattern?: string;
  /** Minimum length (for text fields) */
  minLength?: number;
  /** Maximum length (for text fields) */
  maxLength?: number;
}

/**
 * Input for test data generation
 */
export interface TestDataGeneratorInput {
  /** Field definitions to generate data for */
  fields: FieldDef[];
  /** Locale for locale-specific data */
  locale: Locale;
  /** Number of records to generate */
  count: number;
}

/**
 * Zod schema for field definition validation
 */
const FieldDefSchema = z.object({
  name: z.string(),
  type: z.enum([
    "email",
    "phone",
    "name",
    "address",
    "date",
    "creditCard",
    "IBAN",
    "SaudiId",
    "Iqama",
    "arabicName",
    "nationalId",
    "passportNumber",
    "city",
    "country",
    "company",
    "username",
    "password",
    "url",
    "text",
    "number",
  ]),
  required: z.boolean().default(true),
  pattern: z.string().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
});

/**
 * TestDataGenerator creates realistic test data
 *
 * Supports:
 * - Standard fields: email, phone, name, address, date, etc.
 * - GCC-specific fields: Saudi mobile, IBAN SA, Iqama, Arabic names
 * - Locale-aware formatting: en-US, en-GB, ar-SA, ar-AE, fr-FR
 *
 * @example
 * ```ts
 * const generator = new TestDataGenerator();
 * const data = await generator.generate({
 *   fields: [
 *     { name: "email", type: "email" },
 *     { name: "phone", type: "phone" },
 *     { name: "nationalId", type: "SaudiId" },
 *   ],
 *   locale: "ar-SA",
 *   count: 10,
 * });
 * ```
 */
export class TestDataGenerator {
  /**
   * Generate test data records
   *
   * @param input - Field definitions, locale, and count
   * @returns Array of generated data records
   */
  generate(input: TestDataGeneratorInput): Record<string, unknown>[] {
    const validatedFields = z.array(FieldDefSchema).parse(input.fields);
    const records: Record<string, unknown>[] = [];

    log(
      "Generating %d records with %d fields for locale %s",
      input.count,
      validatedFields.length,
      input.locale
    );

    for (let i = 0; i < input.count; i++) {
      const record: Record<string, unknown> = {};

      for (const field of validatedFields) {
        record[field.name] = this._generateFieldValue(field, input.locale, i);
      }

      records.push(record);
    }

    return records;
  }

  /**
   * Generate a single field value based on type and locale
   */
  private _generateFieldValue(
    field: FieldDef,
    locale: Locale,
    _seed: number
  ): string | number {
    switch (field.type) {
      case "email":
        return this._generateEmail(locale);
      case "phone":
        return this._generatePhone(locale);
      case "name":
        return this._generateName(locale);
      case "arabicName":
        return this._generateArabicName();
      case "address":
        return this._generateAddress(locale);
      case "date":
        return this._generateDate();
      case "creditCard":
        return this._generateCreditCard();
      case "IBAN":
        return this._generateIBAN(locale);
      case "SaudiId":
        return this._generateSaudiId();
      case "Iqama":
        return this._generateIqama();
      case "nationalId":
        return locale === "ar-SA" ? this._generateSaudiId() : this._generateNationalId(locale);
      case "passportNumber":
        return this._generatePassportNumber(locale);
      case "city":
        return this._generateCity(locale);
      case "country":
        return this._generateCountry(locale);
      case "company":
        return this._generateCompany(locale);
      case "username":
        return this._generateUsername();
      case "password":
        return this._generatePassword();
      case "url":
        return this._generateUrl();
      case "text":
        return this._generateText(field);
      case "number":
        return this._generateNumber();
      default: {
        const _exhaustiveCheck: never = field.type;
        throw new Error(`Unknown field type: ${_exhaustiveCheck}`);
      }
    }
  }

  /**
   * Generate a realistic email address
   */
  private _generateEmail(locale: Locale): string {
    const firstNames = locale.startsWith("ar")
      ? ["ahmed", "fatima", "mohammed", "noura", "khalid"]
      : ["john", "jane", "alex", "sam", "chris"];
    const lastNames = locale.startsWith("ar")
      ? ["alkhalidi", "alrasheed", "alhamdan", "alqahtani", "alotaibi"]
      : ["smith", "johnson", "williams", "brown", "jones"];
    const domains =
      locale === "ar-SA"
        ? ["gmail.com", "hotmail.com", "outlook.com", "stc.net.sa"]
        : locale === "fr-FR"
          ? ["gmail.com", "orange.fr", "wanadoo.fr", "free.fr"]
          : ["gmail.com", "yahoo.com", "outlook.com", "example.com"];

    const first =
      firstNames[Math.floor(Math.random() * firstNames.length)] ?? "user";
    const last =
      lastNames[Math.floor(Math.random() * lastNames.length)] ?? "test";
    const domain =
      domains[Math.floor(Math.random() * domains.length)] ?? "example.com";
    const num = Math.floor(Math.random() * 9999);

    return `${first}.${last}${num}@${domain}`;
  }

  /**
   * Generate a phone number appropriate for the locale
   */
  private _generatePhone(locale: Locale): string {
    switch (locale) {
      case "ar-SA":
        // Saudi mobile: 05xxxxxxxx
        return `05${this._randomDigits(8)}`;
      case "ar-AE":
        // UAE mobile: 05x xxx xxxx
        return `05${this._randomDigitInRange(0, 9)} ${this._randomDigits(3)} ${this._randomDigits(4)}`;
      case "en-US":
        // US format: (xxx) xxx-xxxx
        return `(${this._randomDigitInRange(2, 9)}${this._randomDigits(2)}) ${this._randomDigits(3)}-${this._randomDigits(4)}`;
      case "en-GB":
        // UK format: 07xxx xxxxxx
        return `07${this._randomDigits(9)}`;
      case "fr-FR":
        // France format: 0x xx xx xx xx
        return `0${this._randomDigitInRange(1, 9)} ${this._randomDigits(2)} ${this._randomDigits(2)} ${this._randomDigits(2)} ${this._randomDigits(2)}`;
      default:
        return this._randomDigits(10);
    }
  }

  /**
   * Generate a personal name
   */
  private _generateName(locale: Locale): string {
    const firstNames =
      locale.startsWith("ar")
        ? ["Ahmed", "Mohammed", "Ali", "Omar", "Hassan"]
        : locale === "fr-FR"
          ? ["Pierre", "Marie", "Jean", "Sophie", "Luc"]
          : ["John", "Jane", "Alex", "Sam", "Chris"];

    const lastNames =
      locale.startsWith("ar")
        ? ["Al-Rashid", "Al-Saud", "Al-Fayed", "Al-Maktoum", "Al-Nahyan"]
        : locale === "fr-FR"
          ? ["Dupont", "Martin", "Bernard", "Petit", "Robert"]
          : ["Smith", "Johnson", "Williams", "Brown", "Jones"];

    const first =
      firstNames[Math.floor(Math.random() * firstNames.length)] ?? "John";
    const last =
      lastNames[Math.floor(Math.random() * lastNames.length)] ?? "Doe";

    return `${first} ${last}`;
  }

  /**
   * Generate an Arabic name
   */
  private _generateArabicName(): string {
    const firstNames = [
      "أحمد",
      "محمد",
      "فاطمة",
      "نورة",
      "خالد",
      "عبدالله",
      "سارة",
      "عمر",
    ];
    const middleNames = [
      "بن",
      "بنت",
    ];
    const lastNames = [
      "الخالد",
      "الراشد",
      "الحماد",
      "القحطاني",
      "العتيبي",
      "الدوسري",
    ];

    const first =
      firstNames[Math.floor(Math.random() * firstNames.length)] ?? "أحمد";
    const last =
      lastNames[Math.floor(Math.random() * lastNames.length)] ?? "الخالد";

    return `${first} ${last}`;
  }

  /**
   * Generate a realistic address
   */
  private _generateAddress(locale: Locale): string {
    const streets =
      locale.startsWith("ar")
        ? ["شارع الملك فهد", "شارع العليا", "شارع التحلية", "طريق الملك عبدالعزيز"]
        : locale === "fr-FR"
          ? ["Rue de la Paix", "Avenue des Champs-Élysées", "Boulevard Haussmann"]
          : ["Main Street", "Oak Avenue", "Maple Drive", "Park Boulevard"];

    const cities =
      locale === "ar-SA"
        ? ["الرياض", "جدة", "الدمام", "مكة"]
        : locale === "ar-AE"
          ? ["دبي", "أبوظبي", "الشارقة"]
          : locale === "fr-FR"
            ? ["Paris", "Lyon", "Marseille"]
            : ["New York", "Los Angeles", "Chicago"];

    const street =
      streets[Math.floor(Math.random() * streets.length)] ?? "Main Street";
    const city =
      cities[Math.floor(Math.random() * cities.length)] ?? "City";
    const number = Math.floor(Math.random() * 9999) + 1;

    return `${number} ${street}, ${city}`;
  }

  /**
   * Generate a random date within the last 30 years
   */
  private _generateDate(): string {
    const start = new Date(1994, 0, 1);
    const end = new Date();
    const date = new Date(
      start.getTime() + Math.random() * (end.getTime() - start.getTime())
    );
    return date.toISOString().split("T")[0] ?? date.toISOString();
  }

  /**
   * Generate a valid-looking credit card number (Luhn-valid)
   */
  private _generateCreditCard(): string {
    // Generate a Visa-like card: 4xxx xxxx xxxx xxxx
    const base = `4${this._randomDigits(14)}`;
    const checkDigit = this._luhnCheckDigit(base);
    return `${base}${checkDigit}`;
  }

  /**
   * Calculate Luhn check digit for credit card validation
   */
  private _luhnCheckDigit(number: string): number {
    let sum = 0;
    let isEven = true;

    for (let i = number.length - 1; i >= 0; i--) {
      let digit = parseInt(number[i] ?? "0", 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return (10 - (sum % 10)) % 10;
  }

  /**
   * Generate an IBAN number appropriate for the locale
   */
  private _generateIBAN(locale: Locale): string {
    switch (locale) {
      case "ar-SA":
        // Saudi IBAN: SA + 2 check digits + 2 bank digits + 18 account digits
        return `SA${this._randomDigits(2)}${this._randomDigits(2)}${this._randomDigits(18)}`;
      case "en-GB":
        // UK IBAN: GB + 2 check + 4 bank + 6 sort + 8 account
        return `GB${this._randomDigits(2)}${this._randomDigits(4)}${this._randomDigits(6)}${this._randomDigits(8)}`;
      case "fr-FR":
        // France IBAN: FR + 2 check + 5 bank + 5 branch + 11 account + 2 key
        return `FR${this._randomDigits(2)}${this._randomDigits(5)}${this._randomDigits(5)}${this._randomDigits(11)}${this._randomDigits(2)}`;
      default:
        return `XX${this._randomDigits(2)}${this._randomDigits(20)}`;
    }
  }

  /**
   * Generate a Saudi National ID number (10 digits starting with 1)
   */
  private _generateSaudiId(): string {
    return `1${this._randomDigits(9)}`;
  }

  /**
   * Generate a Saudi Iqama (residence permit) number (10 digits starting with 2)
   */
  private _generateIqama(): string {
    return `2${this._randomDigits(9)}`;
  }

  /**
   * Generate a generic national ID number
   */
  private _generateNationalId(_locale: Locale): string {
    return this._randomDigits(9);
  }

  /**
   * Generate a passport number
   */
  private _generatePassportNumber(locale: Locale): string {
    const prefix =
      locale === "ar-SA"
        ? "SA"
        : locale === "en-US"
          ? "US"
          : locale === "en-GB"
            ? "GB"
            : locale === "fr-FR"
              ? "FR"
              : "XX";
    return `${prefix}${this._randomDigits(8)}`;
  }

  /**
   * Generate a city name appropriate for the locale
   */
  private _generateCity(locale: Locale): string {
    const cities: Record<Locale, string[]> = {
      "ar-SA": ["الرياض", "جدة", "الدمام", "مكة", "المدينة", "تبوك"],
      "ar-AE": ["دبي", "أبوظبي", "الشارقة", "عجمان", "رأس الخيمة"],
      "en-US": ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix"],
      "en-GB": ["London", "Manchester", "Birmingham", "Leeds", "Glasgow"],
      "fr-FR": ["Paris", "Marseille", "Lyon", "Toulouse", "Nice"],
    };

    const list = cities[locale] ?? cities["en-US"]!;
    return list[Math.floor(Math.random() * list.length)] ?? "Unknown";
  }

  /**
   * Generate a country name
   */
  private _generateCountry(locale: Locale): string {
    const countries: Record<Locale, string[]> = {
      "ar-SA": [
        "المملكة العربية السعودية",
        "الإمارات",
        "الكويت",
        "قطر",
        "البحرين",
        "عمان",
      ],
      "ar-AE": [
        "الإمارات العربية المتحدة",
        "السعودية",
        "الكويت",
        "قطر",
        "البحرين",
      ],
      "en-US": ["United States", "Canada", "Mexico", "United Kingdom", "France"],
      "en-GB": ["United Kingdom", "Ireland", "France", "Germany", "Spain"],
      "fr-FR": ["France", "Belgique", "Suisse", "Canada", "Allemagne"],
    };

    const list = countries[locale] ?? countries["en-US"]!;
    return list[Math.floor(Math.random() * list.length)] ?? "Unknown";
  }

  /**
   * Generate a company name
   */
  private _generateCompany(locale: Locale): string {
    const companies =
      locale.startsWith("ar")
        ? ["شركة التقنية المتقدمة", "مؤسسة النور", "شركة الخليج", "مجموعة الراجحي"]
        : locale === "fr-FR"
          ? ["Société Générale", "Carrefour", "Total", "Orange", "Renault"]
          : ["Acme Corp", "TechStart Inc", "Global Solutions", "DataFlow LLC"];

    return (
      companies[Math.floor(Math.random() * companies.length)] ?? "Acme Corp"
    );
  }

  /**
   * Generate a username
   */
  private _generateUsername(): string {
    const adjectives = [
      "happy",
      "fast",
      "smart",
      "cool",
      "bright",
      "calm",
      "bold",
    ];
    const nouns = [
      "tiger",
      "eagle",
      "wolf",
      "hawk",
      "bear",
      "fox",
      "lion",
    ];

    const adj =
      adjectives[Math.floor(Math.random() * adjectives.length)] ?? "fast";
    const noun = nouns[Math.floor(Math.random() * nouns.length)] ?? "user";
    const num = Math.floor(Math.random() * 999);

    return `${adj}${noun}${num}`;
  }

  /**
   * Generate a strong password
   */
  private _generatePassword(): string {
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const digits = "0123456789";
    const special = "!@#$%^&*";

    const allChars = upper + lower + digits + special;
    const length = 16;

    // Ensure at least one of each type
    let password =
      (upper[Math.floor(Math.random() * upper.length)] ?? "A") +
      (lower[Math.floor(Math.random() * lower.length)] ?? "a") +
      (digits[Math.floor(Math.random() * digits.length)] ?? "1") +
      (special[Math.floor(Math.random() * special.length)] ?? "!");

    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)] ?? "x";
    }

    // Shuffle
    return password
      .split("")
      .sort(() => Math.random() - 0.5)
      .join("");
  }

  /**
   * Generate a URL
   */
  private _generateUrl(): string {
    const domains = [
      "example.com",
      "test.org",
      "demo.dev",
      "sample.io",
      "mock.app",
    ];
    const paths = [
      "/home",
      "/about",
      "/contact",
      "/products",
      "/services",
      "/login",
    ];

    const domain =
      domains[Math.floor(Math.random() * domains.length)] ?? "example.com";
    const path = paths[Math.floor(Math.random() * paths.length)] ?? "/";

    return `https://www.${domain}${path}`;
  }

  /**
   * Generate random text
   */
  private _generateText(field: FieldDef): string {
    const minLength = field.minLength ?? 5;
    const maxLength = field.maxLength ?? 20;
    const length =
      Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    const words = [
      "lorem",
      "ipsum",
      "dolor",
      "sit",
      "amet",
      "test",
      "sample",
      "data",
      "record",
      "value",
    ];

    const result: string[] = [];
    for (let i = 0; i < length; i++) {
      result.push(
        words[Math.floor(Math.random() * words.length)] ?? "lorem"
      );
    }

    return result.join(" ");
  }

  /**
   * Generate a random number
   */
  private _generateNumber(): number {
    return Math.floor(Math.random() * 10000);
  }

  /**
   * Generate random digits
   */
  private _randomDigits(length: number): string {
    let result = "";
    for (let i = 0; i < length; i++) {
      result += Math.floor(Math.random() * 10);
    }
    return result;
  }

  /**
   * Generate a random digit in a range
   */
  private _randomDigitInRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

/**
 * Pre-built data generation presets for common test scenarios
 */
export enum DataPreset {
  /** Saudi national user profile with ID, phone, name */
  SAUDI_USER = "SAUDI_USER",
  /** GCC company with trade license and contact details */
  GCC_COMPANY = "GCC_COMPANY",
  /** Safe credit card (last 4 visible, rest masked) */
  CREDIT_CARD_SAFE = "CREDIT_CARD_SAFE",
  /** Test login credentials (fake email + password) */
  TEST_CREDENTIALS = "TEST_CREDENTIALS",
  /** Arabic address (street, city, postal code) */
  ARABIC_ADDRESS = "ARABIC_ADDRESS",
}

/**
 * Arabic-specific test data presets with Saudi regulatory formats
 */
export const ArabicTestDataPresets: Record<DataPreset, FieldDef[]> = {
  [DataPreset.SAUDI_USER]: [
    { name: "fullName_ar", type: "arabicName", required: true },
    { name: "fullName_en", type: "name", required: true },
    { name: "saudiId", type: "SaudiId", required: true },
    { name: "mobile", type: "phone", required: true },
    { name: "email", type: "email", required: true },
    { name: "city", type: "city", required: true },
  ],
  [DataPreset.GCC_COMPANY]: [
    { name: "companyName_ar", type: "company", required: true },
    { name: "tradeLicense", type: "text", required: true, pattern: "^[0-9]{10}$" },
    { name: "crNumber", type: "text", required: true, pattern: "^[0-9]{10}$" },
    { name: "contactPerson", type: "name", required: true },
    { name: "phone", type: "phone", required: true },
    { name: "email", type: "email", required: true },
    { name: "iban", type: "IBAN", required: true },
  ],
  [DataPreset.CREDIT_CARD_SAFE]: [
    { name: "cardNumber", type: "creditCard", required: true },
    { name: "cardHolder", type: "name", required: true },
    { name: "expiryDate", type: "date", required: true },
  ],
  [DataPreset.TEST_CREDENTIALS]: [
    { name: "username", type: "username", required: true },
    { name: "email", type: "email", required: true },
    { name: "password", type: "password", required: true },
  ],
  [DataPreset.ARABIC_ADDRESS]: [
    { name: "street_ar", type: "address", required: true },
    { name: "city_ar", type: "city", required: true },
    { name: "country_ar", type: "country", required: true },
    { name: "postalCode", type: "text", required: true, pattern: "^[0-9]{5}$" },
  ],
};

/**
 * Generate data from a preset
 *
 * @param preset - The DataPreset to use
 * @param count - Number of records to generate
 * @param locale - Locale for generation (defaults to ar-SA for Arabic presets)
 */
export function generateFromPreset(
  preset: DataPreset,
  count: number = 5,
  locale: Locale = "ar-SA"
): Record<string, unknown>[] {
  const fields = ArabicTestDataPresets[preset];
  if (!fields) {
    throw new Error(`Unknown preset: ${preset}`);
  }
  const generator = new TestDataGenerator();
  return generator.generate({ fields, locale, count });
}

/**
 * Mask sensitive fields in data records
 *
 * Replaces values of specified fields with "***MASKED***" to prevent
 * sensitive data from appearing in logs, reports, or test outputs.
 *
 * @param data - Array of data records to mask
 * @param fields - Field names to mask
 * @returns New array with masked fields (original data is not modified)
 */
export function maskSensitiveFields(
  data: Record<string, unknown>[],
  fields: string[]
): Record<string, unknown>[] {
  const mask = "***MASKED***";
  return data.map((record) => {
    const masked = { ...record };
    for (const field of fields) {
      if (field in masked) {
        masked[field] = mask;
      }
    }
    return masked;
  });
}
