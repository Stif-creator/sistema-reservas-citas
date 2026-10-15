export function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  const values = crypto.getRandomValues(new Uint32Array(20))
  return 'Aa7!' + Array.from(values, value => alphabet[value % alphabet.length]).join('')
}
