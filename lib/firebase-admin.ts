import type { Firestore } from "firebase-admin/firestore"
import type { App } from "firebase-admin/app"
import type { Auth } from "firebase-admin/auth"

let _app: App | undefined
let _db: Firestore | undefined
let _auth: Auth | undefined

async function getAdminApp(): Promise<App> {
    if (_app) return _app

    const { initializeApp, getApps, cert } = await import("firebase-admin/app")

    if (getApps().length > 0) {
        _app = getApps()[0]
        return _app
    }

    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY

    if (raw) {
        try {
            const serviceAccount = JSON.parse(raw)
            _app = initializeApp({ credential: cert(serviceAccount) })
        } catch {
            console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY")
        }
    }

    if (!_app) {
        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
        if (projectId) {
            _app = initializeApp({ projectId })
        } else {
            throw new Error(
                "Firebase Admin 초기화 실패: FIREBASE_SERVICE_ACCOUNT_KEY 또는 NEXT_PUBLIC_FIREBASE_PROJECT_ID를 설정해주세요."
            )
        }
    }

    return _app
}

export async function getAdminDb(): Promise<Firestore> {
    if (_db) return _db

    const { getFirestore } = await import("firebase-admin/firestore")
    _db = getFirestore(await getAdminApp())
    return _db
}

export async function getAdminAuth(): Promise<Auth> {
    if (_auth) return _auth

    const { getAuth } = await import("firebase-admin/auth")
    _auth = getAuth(await getAdminApp())
    return _auth
}
