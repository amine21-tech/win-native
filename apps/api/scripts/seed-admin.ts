/**
 * Cree ou met a jour un compte administrateur.
 *
 *   npm run seed:admin -- \
 *        --email amiir@example.dz --name "Amiir" --role admin
 *
 * Le mot de passe est demande au clavier, jamais passe en argument : un
 * argument de ligne de commande finit dans l'historique du shell.
 */
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import argon2 from 'argon2';
import { sqlClient } from '../src/db/client.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string', default: 'moderator' },
  },
});

if (!values.email || !values.name) {
  console.error('Usage : --email <courriel> --name <nom affiche> [--role moderator|admin]');
  process.exit(1);
}
if (values.role !== 'moderator' && values.role !== 'admin') {
  console.error('Le role doit valoir moderator ou admin.');
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question('Mot de passe (12 caracteres minimum) : ');
const confirm = await rl.question('Confirmation : ');
rl.close();

if (password.length < 12) {
  console.error('Mot de passe trop court.');
  process.exit(1);
}
if (password !== confirm) {
  console.error('Les deux saisies different.');
  process.exit(1);
}

const hash = await argon2.hash(password, { type: argon2.argon2id });

await sqlClient`
  INSERT INTO admins (email, password_hash, display_name, role)
  VALUES (lower(${values.email}), ${hash}, ${values.name}, ${values.role})
  ON CONFLICT (email) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        display_name  = EXCLUDED.display_name,
        role          = EXCLUDED.role`;

console.log(`Compte ${values.email} enregistre avec le role ${values.role}.`);
await sqlClient.end();
