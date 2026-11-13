// Preact + hooks + htm in one pinned ES module — no build step needed.
export {
  html, render, h, Component,
  useState, useEffect, useMemo, useCallback, useRef, useReducer, useContext,
  createContext,
} from 'https://unpkg.com/htm@3.1.1/preact/standalone.module.js';
