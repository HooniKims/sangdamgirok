"use client"

import { createContext, useContext, useCallback, useSyncExternalStore } from "react"

type Theme = "light" | "dark" | "system"

type ThemeContextValue = {
    theme: Theme
    resolvedTheme: "light" | "dark"
    setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: "system",
    resolvedTheme: "light",
    setTheme: () => { },
})

export const useTheme = () => useContext(ThemeContext)

const STORAGE_KEY = "sangdam-theme"

function getSystemPreference(): "light" | "dark" {
    if (typeof window === "undefined") return "light"
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function resolveTheme(t: Theme): "light" | "dark" {
    if (t === "system") return getSystemPreference()
    return t
}

function applyThemeToDOM(resolved: "light" | "dark") {
    const root = document.documentElement
    if (resolved === "dark") {
        root.classList.add("dark")
    } else {
        root.classList.remove("dark")
    }
}

/* ── 외부 스토어: 테마 ── */
let currentTheme: Theme = "system"
const themeListeners = new Set<() => void>()

function getThemeSnapshot(): Theme { return currentTheme }
function getThemeServerSnapshot(): Theme { return "system" }
function subscribeTheme(cb: () => void) { themeListeners.add(cb); return () => { themeListeners.delete(cb) } }

function writeTheme(next: Theme) {
    currentTheme = next
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, next)
    applyThemeToDOM(resolveTheme(next))
    themeListeners.forEach(fn => fn())
}

/* ── 외부 스토어: 마운트 여부 ── */
let mounted = false
const mountListeners = new Set<() => void>()

function getMountSnapshot(): boolean { return mounted }
function getMountServerSnapshot(): boolean { return false }
function subscribeMount(cb: () => void) { mountListeners.add(cb); return () => { mountListeners.delete(cb) } }

/* ── 초기화 (모듈 로드 시 1회) ── */
if (typeof window !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "light" || stored === "dark" || stored === "system") currentTheme = stored
    applyThemeToDOM(resolveTheme(currentTheme))

    // 시스템 테마 변경 감지
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (currentTheme !== "system") return
        applyThemeToDOM(getSystemPreference())
        themeListeners.forEach(fn => fn())
    })

    // 마운트 완료 표시 (queueMicrotask로 hydration 이후)
    queueMicrotask(() => {
        mounted = true
        mountListeners.forEach(fn => fn())
    })
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
    const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeServerSnapshot)
    const isMounted = useSyncExternalStore(subscribeMount, getMountSnapshot, getMountServerSnapshot)
    const resolved = resolveTheme(theme)

    const setTheme = useCallback((next: Theme) => writeTheme(next), [])

    if (!isMounted) return null

    return (
        <ThemeContext.Provider value={{ theme, resolvedTheme: resolved, setTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}
