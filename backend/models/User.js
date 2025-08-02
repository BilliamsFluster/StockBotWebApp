// models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// ========================
// 🔐 Encryption constants
// ========================
const ALGO = 'aes-256-gcm';
const ENC_KEY = Buffer.from(process.env.MASTER_ENCRYPTION_KEY, 'hex'); // 32 bytes

// ========================
// 🔐 Helper functions
// ========================
function encryptString(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(12); // 96-bit IV
  const cipher = crypto.createCipheriv(ALGO, ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptString(data) {
  if (!data || typeof data !== 'string') return null;

  const parts = data.split(':');
  if (parts.length !== 3) {
    // Not encrypted — return as-is
    return data;
  }

  const [ivHex, tagHex, contentHex] = parts;
  const decipher = crypto.createDecipheriv(ALGO, ENC_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(contentHex, 'hex')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}


// ========================
// 📄 Subschemas
// ========================
const SchwabTokenSchema = new mongoose.Schema({
  app_key: String,
  app_secret: String,
  access_token: String,
  refresh_token: String,
  expires_at: Number // ms timestamp
}, { _id: false });

const AlpacaTokenSchema = new mongoose.Schema({
  app_key: String,
  app_secret: String,
  mode: { type: String, enum: ['paper', 'live'], default: 'paper' }
}, { _id: false });

const PreferencesSchema = new mongoose.Schema({
  model: { type: String, default: 'qwen3:8b' },
  format: { type: String, default: 'markdown' },
  voiceEnabled: { type: Boolean, default: false },
  activeBroker: { type: String, enum: ['schwab', 'alpaca'], default: 'alpaca' }
}, { _id: false });

// ========================
// 👤 User Schema
// ========================
const userSchema = new mongoose.Schema({
  username: { type: String, required: [true, 'Name is required'] },
  email: { type: String, required: [true, 'Email is required'], unique: true, lowercase: true },
  password: { type: String, required: [true, 'Password is required'], minlength: 6 },
  refreshToken: String,
  schwab_tokens: SchwabTokenSchema,
  alpaca_tokens: AlpacaTokenSchema,
  preferences: PreferencesSchema,
}, { timestamps: true });

// ========================
// 🔄 Pre-save Encryption
// ========================
userSchema.pre('save', async function (next) {
  // Hash password
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  // Encrypt Schwab tokens if plain text
  if (this.isModified('schwab_tokens')) {
    for (const key of ['app_key', 'app_secret', 'access_token', 'refresh_token']) {
      if (this.schwab_tokens?.[key] && !this.schwab_tokens[key].includes(':')) {
        this.schwab_tokens[key] = encryptString(this.schwab_tokens[key]);
      }
    }
  }

  // Encrypt Alpaca tokens if plain text
  if (this.isModified('alpaca_tokens')) {
    for (const key of ['app_key', 'app_secret']) {
      if (this.alpaca_tokens?.[key] && !this.alpaca_tokens[key].includes(':')) {
        this.alpaca_tokens[key] = encryptString(this.alpaca_tokens[key]);
      }
    }
  }

  next();
});

// ========================
// 🔓 Decryption Helper
// ========================
userSchema.methods.getDecryptedTokens = function () {
  const decrypted = {
    schwab_tokens: {},
    alpaca_tokens: {}
  };

  if (this.schwab_tokens) {
    for (const key of ['app_key', 'app_secret', 'access_token', 'refresh_token']) {
      decrypted.schwab_tokens[key] = decryptString(this.schwab_tokens[key]);
    }
    decrypted.schwab_tokens.expires_at = this.schwab_tokens.expires_at;
  }

  if (this.alpaca_tokens) {
    for (const key of ['app_key', 'app_secret']) {
      decrypted.alpaca_tokens[key] = decryptString(this.alpaca_tokens[key]);
    }
    decrypted.alpaca_tokens.mode = this.alpaca_tokens.mode;
  }

  return decrypted;
};

// ========================
// 🔑 Password Compare
// ========================
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);
export default User;


/*async function encryptLegacySchwabTokens() {
  const users = await User.find({ 'schwab_tokens.app_key': { $exists: true } });

  for (const user of users) {
    let updated = false;

    for (const key of ['app_key', 'app_secret', 'access_token', 'refresh_token']) {
      const val = user.schwab_tokens?.[key];
      if (val && typeof val === 'string' && val.split(':').length !== 3) {
        user.schwab_tokens[key] = encryptString(val);
        updated = true;
      }
    }

    if (updated) {
      await user.save();
      console.log(`Updated Schwab tokens for user: ${user._id}`);
    }
  }

  console.log('Migration complete');
}

encryptLegacySchwabTokens();*/

/*async function encryptLegacyAlpacaTokens() {
  await mongoose.connect(process.env.MONGO_URI);

  const users = await User.find({ 'alpaca_tokens.app_key': { $exists: true } });

  for (const user of users) {
    let updated = false;

    for (const key of ['app_key', 'app_secret']) {
      const val = user.alpaca_tokens?.[key];
      if (val && typeof val === 'string' && val.split(':').length !== 3) {
        user.alpaca_tokens[key] = encryptString(val);
        updated = true;
      }
    }

    if (updated) {
      await user.save();
      console.log(`Updated Alpaca tokens for user: ${user._id}`);
    }
  }

  console.log('✅ Migration complete');
  process.exit();
}

encryptLegacyAlpacaTokens();*/
