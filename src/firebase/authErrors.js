const MESSAGES = {
  'auth/email-already-in-use': 'Ese correo ya está registrado.',
  'auth/invalid-email': 'El correo no es válido.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/user-not-found': 'No existe una cuenta con ese correo.',
  'auth/wrong-password': 'La contraseña es incorrecta.',
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/too-many-requests': 'Demasiados intentos fallidos. Intenta de nuevo más tarde.',
}

export function getAuthErrorMessage(error) {
  return MESSAGES[error?.code] || 'Ocurrió un error inesperado. Intenta de nuevo.'
}
