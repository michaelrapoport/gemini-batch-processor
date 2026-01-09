
const DB_NAME = 'gemini_patent_db';
const DB_VERSION = 1;
const STORE_NAME = 'processed_patents';

export interface PatentRecord {
    id?: number;
    title: string;
    wordCount: number;
    fileName: string;
    timestamp: string;
}

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => reject("IndexedDB error: " + (event.target as any).error);

        request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('title', 'title', { unique: false });
                store.createIndex('wordCount', 'wordCount', { unique: false });
            }
        };
    });
};

export const PatentDB = {
    add: async (record: PatentRecord): Promise<void> => {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add(record);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    getByTitle: async (title: string): Promise<PatentRecord[]> => {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('title');
            // Normalize title for query? Assuming exact match for now as per "same or similar"
            const request = index.getAll(title.trim());
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
};
