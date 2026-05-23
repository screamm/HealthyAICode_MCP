// packages/core/tests/fixtures/ai-code-samples.ts

/**
 * Typical AI-generated code: heavy JSDoc, section comments, verbose naming,
 * generic variable names, boilerplate phrases.
 */
export const AI_GENERATED_SAMPLE = `
/**
 * Processes the user authentication request and validates credentials.
 * This function handles the complete authentication flow including validation,
 * token generation, and session management.
 * @param userCredentials - The user's login credentials
 * @param sessionOptions - Configuration options for the session
 * @returns Authentication result with token and user information
 */
export async function processUserAuthenticationRequest(
  userCredentials: { username: string; password: string; rememberMe: boolean },
  sessionOptions: { timeout: number; secure: boolean; domain: string },
): Promise<{ token: string; user: { id: string; name: string }; expiresAt: Date }> {
  // --- Input Validation Section ---
  // This function validates the user credentials before processing
  if (!userCredentials.username || userCredentials.username.length === 0) {
    throw new Error('Username cannot be empty');
  }

  // --- Password Validation Section ---
  // Helper function to check password strength
  if (userCredentials.password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  // Initialize result
  const result = {};
  const data = {};
  const response = {};

  // --- Token Generation Section ---
  const token = generateSecureToken(32);

  // --- Session Creation Section ---
  const session = createSession(token, sessionOptions.timeout);

  // Return result
  return { token, user: { id: '123', name: userCredentials.username }, expiresAt: session.expiresAt };
}
`;

/**
 * Typical human-written code: minimal comments, named constants, incremental style.
 */
export const HUMAN_WRITTEN_SAMPLE = `
const MIN_PASSWORD_LENGTH = 8;
const TOKEN_LENGTH = 32;

export async function authenticate(credentials: UserCredentials): Promise<AuthResult> {
  validateCredentials(credentials);
  const token = generateSecureToken(TOKEN_LENGTH);
  const session = createSession(token);
  return { token, user: await findUser(credentials.username), expiresAt: session.expiresAt };
}

function validateCredentials(creds: UserCredentials): void {
  if (!creds.username) throw new AuthError('Missing username');
  if (creds.password.length < MIN_PASSWORD_LENGTH) throw new AuthError('Password too short');
}
`;

/**
 * Sample with extreme verbosity and section comments — triggers high AI confidence.
 */
export const VERBOSE_STYLE_SAMPLE = `
/**
 * This function handles the processing of user data and returns a formatted result.
 * This method performs the complete data transformation pipeline.
 * @param {UserData} userData - The raw user data to process
 * @param {ProcessingOptions} options - Options for data processing
 * @returns Processed result object
 */
function processAndTransformUserDataWithValidation(userData: UserData, options: ProcessingOptions) {
  // Initialize result object
  const result = {};
  const output = {};
  const response = {};

  // Step 1: Validate input
  // This ensures that the input data is valid before processing
  if (!userData) {
    throw new Error('User data cannot be null');
  }

  // Step 2: Main logic
  // Handle the case where the data needs transformation
  const data = transformData(userData);

  // Step 3: Return result
  return data;
}
`;

/**
 * Sample with destructuring of many inline fields — triggers AbstractionLeakage.
 */
export const INLINE_TYPES_SAMPLE = `
function processUser({ id, name, email, age, role }: { id: string; name: string; email: string; age: number; role: string }) {
  return name;
}

function processOrder(order: { orderId: string; customerId: string; items: string[]; total: number; currency: string; status: string }) {
  return order.total;
}
`;
