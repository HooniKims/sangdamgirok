"use client"

import { useEffect, useState } from "react"
import { ArrowRight, Lock, Mail, Sparkles, User } from "lucide-react"
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth"
import { doc, serverTimestamp, setDoc } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"

function mapAuthError(code: string): string {
    switch (code) {
        case "auth/invalid-email":
            return "이메일 형식이 올바르지 않습니다."
        case "auth/invalid-credential":
        case "auth/user-not-found":
        case "auth/wrong-password":
            return "이메일 또는 비밀번호가 올바르지 않습니다."
        case "auth/email-already-in-use":
            return "이미 사용 중인 이메일입니다."
        case "auth/weak-password":
            return "비밀번호는 6자 이상이어야 합니다."
        case "auth/too-many-requests":
            return "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
        default:
            return "인증 중 오류가 발생했습니다. 다시 시도해주세요."
    }
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [mode, setMode] = useState<"login" | "signup">("login")
    const [name, setName] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [error, setError] = useState("")
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

    const resetForm = () => {
        setName("")
        setEmail("")
        setPassword("")
        setConfirmPassword("")
        setError("")
    }

    const switchMode = (nextMode: "login" | "signup") => {
        setMode(nextMode)
        resetForm()
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        clearError()
        setIsSubmitting(true)

        try {
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

                const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)

                try {
                    await setDoc(doc(db, "users", credential.user.uid), {
                        uid: credential.user.uid,
                        email: credential.user.email ?? email.trim(),
                        name: name.trim(),
                        role: "teacher",
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    })
                } catch (profileError) {
                    await signOut(auth)
                    throw profileError
                }
            } else {
                await signInWithEmailAndPassword(auth, email.trim(), password)
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

                        <form onSubmit={handleSubmit} className="space-y-4">
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
                                                clearError()
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
                                            clearError()
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
                                            clearError()
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
                                                clearError()
                                            }}
                                            className="input-field"
                                            style={{ paddingLeft: "40px" }}
                                            placeholder="비밀번호를 다시 입력하세요"
                                            required
                                        />
                                    </div>
                                </div>
                            )}

                            {error && <p className="text-sm text-red-500 mt-1">{error}</p>}

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
                        </form>
                    </div>

                    <p className="text-center text-gray-400 text-sm mt-8">© {new Date().getFullYear()} HooniKim All right reserved.</p>
                </div>
            </div>
        )
    }

    return <>{children}</>
}
