// Fixture: a typosquat of the popular npm package "express".
// "expres" is Levenshtein distance 1 from "express" and is NOT in the snapshot.
// Expected: exactly one SlopsquattingRisk smell.
import express from 'expres';

export const app = express();
