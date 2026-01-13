
import { BatchItem, Folder } from '../types';

const DB_NAME = 'gemini_patent_library';
const DB_VERSION = 2; // Incremented version
const STORES = {
    ITEMS: 'library_items',
    FOLDERS: 'library_folders',
    LOGS: 'processed_logs' // Legacy support if needed, or we can migrate
};

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => reject("IndexedDB error: " + (event.target as any).error);

        request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            
            // Create Items Store
            if (!db.objectStoreNames.contains(STORES.ITEMS)) {
                db.createObjectStore(STORES.ITEMS, { keyPath: 'id' });
            }

            // Create Folders Store
            if (!db.objectStoreNames.contains(STORES.FOLDERS)) {
                db.createObjectStore(STORES.FOLDERS, { keyPath: 'id' });
            }
        };
    });
};

export const LibraryDB = {
    // --- Bulk Save (Overwrite State) ---
    saveState: async (items: BatchItem[], folders: Folder[]): Promise<void> => {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.ITEMS, STORES.FOLDERS], 'readwrite');
            
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);

            const itemStore = transaction.objectStore(STORES.ITEMS);
            const folderStore = transaction.objectStore(STORES.FOLDERS);

            // Simple strategy: Clear and Rewrite (Safe for consistent state, acceptable for local app scale)
            // Optimization: In a real app, we'd diff, but for <1000 items this is instant.
            itemStore.clear();
            folderStore.clear();

            items.forEach(item => itemStore.put(item));
            folders.forEach(folder => folderStore.put(folder));
        });
    },

    // --- Load State ---
    loadState: async (): Promise<{ items: BatchItem[], folders: Folder[] }> => {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.ITEMS, STORES.FOLDERS], 'readonly');
            const itemStore = transaction.objectStore(STORES.ITEMS);
            const folderStore = transaction.objectStore(STORES.FOLDERS);

            const itemsRequest = itemStore.getAll();
            const foldersRequest = folderStore.getAll();

            transaction.oncomplete = () => {
                resolve({
                    items: itemsRequest.result || [],
                    folders: foldersRequest.result || []
                });
            };
            
            transaction.onerror = () => reject(transaction.error);
        });
    },
    
    // --- Incremental Updates (Optional, if we want granular control later) ---
    updateItem: async (item: BatchItem): Promise<void> => {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORES.ITEMS], 'readwrite');
            tx.objectStore(STORES.ITEMS).put(item);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },
    
    deleteItem: async (id: string): Promise<void> => {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORES.ITEMS], 'readwrite');
            tx.objectStore(STORES.ITEMS).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }
};

// Legacy support (optional, can be removed if fresh start desired)
export const PatentDB = {
    // Kept for backward compat if needed, but LibraryDB supersedes it
    add: async (record: any) => {}, 
    getByTitle: async (title: string) => []
};
