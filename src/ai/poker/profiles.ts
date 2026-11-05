/**
 * Personajes rivales ficticios. Cada uno combina un nivel de habilidad
 * (elegido por la persona) con un estilo propio.
 */
import type { StyleParams } from './analysis';

export interface RivalProfile {
  id: string;
  name: string;
  /** Descripción pública del estilo (no revela cartas ni razonamiento). */
  tagline: string;
  style: StyleParams;
  /** Colores del avatar (degradado) e iniciales. */
  colors: [string, string];
  initials: string;
}

export const RIVALS: readonly RivalProfile[] = [
  {
    id: 'chayo', name: 'Doña Chayo', initials: 'DC', colors: ['#7b2d4f', '#c45b84'],
    tagline: 'Paciente y cerrada: espera buenas manos.',
    style: { looseness: 0.8, aggression: -0.3, bluff: 0.6, temperature: 0.9 },
  },
  {
    id: 'guero', name: 'El Güero', initials: 'EG', colors: ['#8a5a12', '#e0a83b'],
    tagline: 'Suelto y agresivo: le encanta presionar.',
    style: { looseness: 1.3, aggression: 0.6, bluff: 1.4, temperature: 1.1 },
  },
  {
    id: 'lupita', name: 'Lupita', initials: 'LU', colors: ['#1d5f73', '#3fb1c7'],
    tagline: 'Agresiva y selectiva: cuando entra, entra fuerte.',
    style: { looseness: 0.95, aggression: 0.3, bluff: 1.0, temperature: 1 },
  },
  {
    id: 'fermin', name: 'Don Fermín', initials: 'DF', colors: ['#3c5a24', '#7fb04d'],
    tagline: 'Le gusta ver cartas: paga más de lo que debería.',
    style: { looseness: 1.25, aggression: -0.4, bluff: 0.5, temperature: 1.1 },
  },
  {
    id: 'ines', name: 'La Profe Inés', initials: 'PI', colors: ['#3a2f7a', '#7c6ee0'],
    tagline: 'Equilibrada: difícil de leer.',
    style: { looseness: 1, aggression: 0, bluff: 1, temperature: 1 },
  },
  {
    id: 'chema', name: 'Chema', initials: 'CH', colors: ['#7a1f1f', '#e05a4a'],
    tagline: 'Impredecible: mezcla jugadas raras.',
    style: { looseness: 1.35, aggression: 0.7, bluff: 1.6, temperature: 1.5 },
  },
  {
    id: 'rocio', name: 'Rocío', initials: 'RO', colors: ['#20504a', '#48a89a'],
    tagline: 'Fría y matemática: rara vez se equivoca de tamaño.',
    style: { looseness: 1, aggression: 0.1, bluff: 0.9, temperature: 0.7 },
  },
  {
    id: 'beto', name: 'Tío Beto', initials: 'TB', colors: ['#5a3a1a', '#b07a45'],
    tagline: 'Faroleador nato: cuidado con sus apuestas grandes.',
    style: { looseness: 1.1, aggression: 0.35, bluff: 1.8, temperature: 1.1 },
  },
];

export function rivalById(id: string): RivalProfile {
  return RIVALS.find((r) => r.id === id) ?? RIVALS[4]!;
}
