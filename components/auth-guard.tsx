"use client"

import { useEffect, useState } from "react"
import { ArrowRight, Lock, Mail, Sparkles, User } from "lucide-react"
import { createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth"
import { doc, getDoc, runTransaction, serverTimestamp, setDoc } from "firebase/firestore"
import { auth, db, googleProvider } from "@/lib/firebase"
import { buildEmailLockKey, LOGIN_LOCK_THRESHOLD, normalizeEmail } from "@/utils/authLock"

function mapAuthError(code: string): string {
    switch (code) {
        case "auth/invalid-email":
            return "이메일 형식이 올바르지 않습니다."
        case "auth/invalid-credential":
        case "auth/invalid-login-credentials":
        case "auth/user-not-found":
        case "auth/wrong-password":
            return "이메일 또는 비밀번호가 올바르지 않습니다."
        case "auth/user-disabled":
            return "이 계정은 잠겨 있습니다. 관리자에게 잠금 해제를 요청하세요."
        case "auth/email-already-in-use":
            return "이미 사용 중인 이메일입니다."
        case "auth/weak-password":
            return "비밀번호는 6자 이상이어야 합니다."
        case "auth/too-many-requests":
            return "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
        case "auth/popup-closed-by-user":
            return "구글 로그인 창이 닫혔습니다. 다시 시도해주세요."
        case "auth/popup-blocked":
            return "브라우저에서 팝업이 차단되었습니다. 팝업 차단을 해제해주세요."
        case "auth/cancelled-popup-request":
            return "구글 로그인 요청이 취소되었습니다. 다시 시도해주세요."
        case "auth/account-exists-with-different-credential":
            return "같은 이메일로 다른 로그인 방식이 이미 연결되어 있습니다."
        case "auth/operation-not-allowed":
            return "Firebase 콘솔에서 해당 로그인 방식이 비활성화되어 있습니다."
        default:
            return "인증 중 오류가 발생했습니다. 다시 시도해주세요."
    }
}

function GoogleIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: "18px", height: "18px" }}>
            <path d="M21.805 10.023h-9.81v3.954h5.633c-.243 1.27-.972 2.346-2.07 3.068v2.548h3.346c1.958-1.801 3.088-4.454 3.088-7.593 0-.676-.06-1.326-.187-1.977z" fill="#4285F4" />
            <path d="M11.995 22c2.79 0 5.13-.924 6.84-2.512l-3.346-2.548c-.93.625-2.12.996-3.494.996-2.687 0-4.963-1.814-5.777-4.256H2.759v2.627A10.331 10.331 0 0 0 11.995 22z" fill="#34A853" />
            <path d="M6.218 13.68a6.208 6.208 0 0 1 0-3.96V7.093H2.759a10.331 10.331 0 0 0 0 9.214l3.459-2.627z" fill="#FBBC05" />
            <path d="M11.995 6.064c1.517 0 2.88.522 3.955 1.547l2.967-2.967C17.12 2.946 14.78 2 11.995 2A10.331 10.331 0 0 0 2.759 7.093L6.218 9.72c.814-2.442 3.09-3.656 5.777-3.656z" fill="#EA4335" />
        </svg>
    )
}

type LoginLockData = {
    failedAttempts?: number
    isLocked?: boolean
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [mode, setMode] = useState<"login" | "signup">("login")
    const [name, setName] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [error, setError] = useState("")
    const [notice, setNotice] = useState("")
    const [isLoading, setIsLoading] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setIsAuthenticated(!!user)
            setIsLoading(false)
        })

        return () => unsubscribe()
    }, [])

    const clearError = () => setError("")
    const clearNotice = () => setNotice("")
    const clearMessages = () => {
        clearError()
        clearNotice()
    }

    const resetForm = () => {
        setName("")
        setEmail("")
        setPassword("")
        setConfirmPassword("")
        clearMessages()
    }

    const switchMode = (nextMode: "login" | "signup") => {
        setMode(nextMode)
        resetForm()
    }

    const upsertTeacherProfile = async (params: {
        uid: string
        email: string
        name: string
    }) => {
        const profileRef = doc(db, "users", params.uid)
        const profileSnapshot = await getDoc(profileRef)
        const currentProfile = profileSnapshot.data() as { role?: string } | undefined
        const nextRole = currentProfile?.role || "teacher"

        await setDoc(
            profileRef,
            {
                uid: params.uid,
                email: params.email,
                name: params.name,
                role: nextRole,
                isLocked: false,
                failedLoginAttempts: 0,
                updatedAt: serverTimestamp(),
                ...(profileSnapshot.exists() ? {} : { createdAt: serverTimestamp() }),
            },
            { merge: true }
        )
    }

    const getLockDocRef = async (targetEmail: string) => {
        const lockKey = await buildEmailLockKey(targetEmail)
        return doc(db, "loginLocks", lockKey)
    }

    const getLoginLockData = async (targetEmail: string) => {
        const lockRef = await getLockDocRef(targetEmail)
        const lockSnapshot = await getDoc(lockRef)
        const lockData = (lockSnapshot.data() ?? {}) as LoginLockData
        return {
            lockRef,
            failedAttempts: typeof lockData.failedAttempts === "number" ? lockData.failedAttempts : 0,
            isLocked: Boolean(lockData.isLocked),
        }
    }

    const handlePasswordReset = async () => {
        clearMessages()
        const normalizedEmail = normalizeEmail(email)

        if (!normalizedEmail) {
            setError("비밀번호를 재설정할 이메일을 먼저 입력해주세요.")
            return
        }

        setIsSubmitting(true)
        try {
            await sendPasswordResetEmail(auth, normalizedEmail)
            setNotice("비밀번호 재설정 메일을 보냈습니다. 메일함을 확인해주세요.")
        } catch (err: unknown) {
            const code = typeof err === "object" && err && "code" in err ? String(err.code) : ""
            setError(mapAuthError(code))
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleGoogleSignIn = async () => {
        clearMessages()
        setIsSubmitting(true)

        try {
            const credential = await signInWithPopup(auth, googleProvider)
            const googleEmail = normalizeEmail(credential.user.email || "")

            if (!googleEmail) {
                setError("구글 계정에서 이메일 정보를 확인할 수 없습니다.")
                return
            }

            try {
                await upsertTeacherProfile({
                    uid: credential.user.uid,
                    email: googleEmail,
                    name: credential.user.displayName?.trim() || googleEmail.split("@")[0] || "교사",
                })
                const lockRef = await getLockDocRef(googleEmail)
                await setDoc(
                    lockRef,
                    {
                        failedAttempts: 0,
                        isLocked: false,
                        updatedAt: serverTimestamp(),
                        unlockedAt: serverTimestamp(),
                        unlockedBy: credential.user.uid,
                    },
                    { merge: true }
                )
            } catch (profileError) {
                await signOut(auth)
                throw profileError
            }
        } catch (err: unknown) {
            const code = typeof err === "object" && err && "code" in err ? String(err.code) : ""
            setError(mapAuthError(code))
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        clearMessages()
        setIsSubmitting(true)

        try {
            const normalizedEmail = normalizeEmail(email)

            if (!normalizedEmail) {
                setError("이메일을 입력해주세요.")
                return
            }

            if (mode === "signup") {
                if (!name.trim()) {
                    setError("이름을 입력해주세요.")
                    return
                }

                if (password.length < 6) {
                    setError("비밀번호는 6자 이상이어야 합니다.")
                    return
                }

                if (password !== confirmPassword) {
                    setError("비밀번호 확인이 일치하지 않습니다.")
                    return
                }

                const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password)

                try {
                    await upsertTeacherProfile({
                        uid: credential.user.uid,
                        email: credential.user.email ?? normalizedEmail,
                        name: name.trim(),
                    })
                } catch (profileError) {
                    await signOut(auth)
                    throw profileError
                }
            } else {
                const { lockRef, isLocked } = await getLoginLockData(normalizedEmail)

                if (isLocked) {
                    setError("이 계정은 잠겨 있습니다. 관리자에게 잠금 해제를 요청하거나 비밀번호 재설정을 진행하세요.")
                    return
                }

                try {
                    const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password)
                    await setDoc(
                        lockRef,
                        {
                            failedAttempts: 0,
                            isLocked: false,
                            updatedAt: serverTimestamp(),
                            unlockedAt: serverTimestamp(),
                            unlockedBy: credential.user.uid,
                        },
                        { merge: true }
                    )
                } catch (loginError: unknown) {
                    const code = typeof loginError === "object" && loginError && "code" in loginError ? String(loginError.code) : ""
                    const isCredentialError = [
                        "auth/invalid-credential",
                        "auth/invalid-login-credentials",
                        "auth/user-not-found",
                        "auth/wrong-password",
                    ].includes(code)

                    if (!isCredentialError) {
                        throw loginError
                    }

                    const result = await runTransaction(db, async (transaction) => {
                        const lockSnapshot = await transaction.get(lockRef)
                        const lockData = (lockSnapshot.data() ?? {}) as LoginLockData
                        const currentFailedAttempts = typeof lockData.failedAttempts === "number" ? lockData.failedAttempts : 0
                        const nextFailedAttempts = Math.min(currentFailedAttempts + 1, LOGIN_LOCK_THRESHOLD)
                        const shouldLock = nextFailedAttempts >= LOGIN_LOCK_THRESHOLD

                        transaction.set(
                            lockRef,
                            {
                                failedAttempts: nextFailedAttempts,
                                isLocked: shouldLock,
                                updatedAt: serverTimestamp(),
                                ...(shouldLock ? { lockedAt: serverTimestamp() } : {}),
                            },
                            { merge: true }
                        )

                        return {
                            failedAttempts: nextFailedAttempts,
                            isLocked: shouldLock,
                        }
                    })

                    if (result.isLocked) {
                        setError("비밀번호 10회 이상 실패로 계정이 잠겼습니다. 관리자에게 잠금 해제를 요청해주세요.")
                    } else {
                        const remainingAttempts = LOGIN_LOCK_THRESHOLD - result.failedAttempts
                        setError(`이메일 또는 비밀번호가 올바르지 않습니다. ${remainingAttempts}회 더 실패하면 계정이 잠깁니다.`)
                    }
                    return
                }
            }
        } catch (err: unknown) {
            const code = typeof err === "object" && err && "code" in err ? String(err.code) : ""
            setError(mapAuthError(code))
        } finally {
            setIsSubmitting(false)
        }
    }

    if (isLoading) return null

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div style={{ maxWidth: "420px", width: "100%" }}>
                    <div className="text-center mb-8">
                        <div className="bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg" style={{ width: "64px", height: "64px", transform: "rotate(3deg)" }}>
                            <Sparkles className="text-white" style={{ width: "32px", height: "32px" }} />
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">Sangdam Note</h1>
                        <p className="text-gray-500">교사 계정으로 로그인해 상담 기록을 관리하세요</p>
                    </div>

                    <div className="card p-8 bg-white shadow-xl">
                        <div className="flex gap-2 mb-6 bg-gray-100 rounded-lg p-1">
                            <button
                                type="button"
                                onClick={() => switchMode("login")}
                                className={`btn flex-1 py-2 ${mode === "login" ? "btn-primary" : "btn-ghost"}`}
                            >
                                로그인
                            </button>
                            <button
                                type="button"
                                onClick={() => switchMode("signup")}
                                className={`btn flex-1 py-2 ${mode === "signup" ? "btn-primary" : "btn-ghost"}`}
                            >
                                회원가입
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="flex flex-col" style={{ gap: "18px" }}>
                            {mode === "signup" && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">이름</label>
                                    <div className="relative">
                                        <User className="absolute text-gray-400" style={{ left: "12px", top: "50%", transform: "translateY(-50%)", width: "20px", height: "20px" }} />
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => {
                                                setName(e.target.value)
                                                clearMessages()
                                            }}
                                            className="input-field"
                                            style={{ paddingLeft: "40px" }}
                                            placeholder="홍길동"
                                            required
                                        />
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">이메일</label>
                                <div className="relative">
                                    <Mail className="absolute text-gray-400" style={{ left: "12px", top: "50%", transform: "translateY(-50%)", width: "20px", height: "20px" }} />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => {
                                            setEmail(e.target.value)
                                            clearMessages()
                                        }}
                                        className="input-field"
                                        style={{ paddingLeft: "40px" }}
                                        placeholder="teacher@school.kr"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">비밀번호</label>
                                <div className="relative">
                                    <Lock className="absolute text-gray-400" style={{ left: "12px", top: "50%", transform: "translateY(-50%)", width: "20px", height: "20px" }} />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => {
                                            setPassword(e.target.value)
                                            clearMessages()
                                        }}
                                        className="input-field"
                                        style={{ paddingLeft: "40px" }}
                                        placeholder="비밀번호를 입력하세요"
                                        required
                                    />
                                </div>
                            </div>

                            {mode === "signup" && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">비밀번호 확인</label>
                                    <div className="relative">
                                        <Lock className="absolute text-gray-400" style={{ left: "12px", top: "50%", transform: "translateY(-50%)", width: "20px", height: "20px" }} />
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => {
                                                setConfirmPassword(e.target.value)
                                                clearMessages()
                                            }}
                                            className="input-field"
                                            style={{ paddingLeft: "40px" }}
                                            placeholder="비밀번호를 다시 입력하세요"
                                            required
                                        />
                                    </div>
                                </div>
                            )}

                            {mode === "login" && (
                                <div className="flex justify-end" style={{ marginTop: "-6px" }}>
                                    <button
                                        type="button"
                                        onClick={handlePasswordReset}
                                        disabled={isSubmitting}
                                        className="text-sm font-medium"
                                        style={{ color: "var(--primary)" }}
                                    >
                                        비밀번호 재설정 메일 보내기
                                    </button>
                                </div>
                            )}

                            {error && <p className="text-sm text-red-500">{error}</p>}
                            {notice && <p className="text-sm text-green-600">{notice}</p>}

                            <div className="flex flex-col" style={{ gap: "12px", marginTop: "4px" }}>
                                <button type="submit" className="btn btn-primary w-full py-3 text-lg gap-2 group" disabled={isSubmitting}>
                                    {isSubmitting
                                        ? mode === "login"
                                            ? "로그인 중..."
                                            : "가입 중..."
                                        : mode === "login"
                                            ? "로그인하기"
                                            : "교사 계정 만들기"}
                                    <ArrowRight style={{ width: "20px", height: "20px" }} className="group-hover:translate-x-1 transition-transform" />
                                </button>

                                <div className="flex items-center gap-3">
                                    <div className="flex-1" style={{ height: "1px", backgroundColor: "#e5e7eb" }} />
                                    <span className="text-xs text-gray-400">또는</span>
                                    <div className="flex-1" style={{ height: "1px", backgroundColor: "#e5e7eb" }} />
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-secondary w-full py-3 gap-2"
                                    onClick={handleGoogleSignIn}
                                    disabled={isSubmitting}
                                >
                                    <GoogleIcon />
                                    {mode === "signup" ? "Google로 가입하기" : "Google로 로그인"}
                                </button>
                            </div>
                        </form>
                    </div>

                    <p className="text-center text-gray-400 text-sm mt-8">© {new Date().getFullYear()} HooniKim All right reserved.</p>
                </div>
            </div>
        )
    }

    return <>{children}</>
}
