const MOCK_WSS_URL = 'wss://127.0.0.1';
const MOCK_URL = 'https://127.0.0.1:9999/';
export const MOCK_OPPF = {
    license: {
        expires: '2300-12-01',
        count: 1000,
        id: 'opt-o00-5',
    },
    blob: {
        uploadUrl: MOCK_URL,
        downloadUrl: MOCK_URL,
        doneUrl: MOCK_URL,
    },
    domains: {
        rules: [
            {
                spkis: [
                    {
                        value: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
                        algorithm: 'sha256',
                    },
                ],
                fqdn: '*test.ch',
                matchMode: 'include-subdomains',
            },
        ],
    },
    work: {url: MOCK_URL},
    chat: {publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='},
    signatureKey: '1TrQLW5sipBuw2lcc3Y/gSUGHTzNHuLPN4X9M7Y82m8=',
    safe: {
        rendezvous: {url: MOCK_WSS_URL},
        mediator: {
            blob: {
                uploadUrl: MOCK_URL,
                downloadUrl: MOCK_URL,
                doneUrl: MOCK_URL,
            },
            url: MOCK_WSS_URL,
        },
        url: MOCK_URL,
    },
    refresh: 86400,
    avatar: {url: MOCK_URL},
    updates: {desktop: {autoUpdate: true}},
    version: '1',
    directory: {url: MOCK_URL},
    mediator: {
        blob: {
            uploadUrl: MOCK_URL,
            downloadUrl: MOCK_URL,
            doneUrl: MOCK_URL,
        },
        url: MOCK_WSS_URL,
    },
    rendezvous: {url: MOCK_WSS_URL},
};

export const CORRECT_OPPF_STRING = `{
    "work": {"url": "https://127.0.0.1:9999/"},
    "refresh": 86400,
    "domains": {"rules": [{
        "spkis": [{
            "value": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            "algorithm": "sha256"
        }],
        "fqdn": "*test.ch",
        "matchMode": "include-subdomains"
    }]},
    "avatar": {"url": "https://127.0.0.1:9999/"},
    "updates": {"desktop": {"autoUpdate": true}},
    "version": "1",
    "directory": {"url": "https://127.0.0.1:9999/"},
    "license": {
        "expires": "2300-12-01",
        "count": 1000,
        "id": "opt-o00-5"
    },
    "blob": {
        "uploadUrl": "https://127.0.0.1:9999/",
        "downloadUrl": "https://127.0.0.1:9999/",
        "doneUrl": "https://127.0.0.1:9999/"
    },
    "chat": {"publicKey": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="},
    "signatureKey": "1TrQLW5sipBuw2lcc3Y/gSUGHTzNHuLPN4X9M7Y82m8=",
    "safe": {
        "rendezvous": {"url": "wss://127.0.0.1"},
        "mediator": {
            "blob": {
                "uploadUrl": "https://127.0.0.1:9999/",
                "downloadUrl": "https://127.0.0.1:9999/",
                "doneUrl": "https://127.0.0.1:9999/"
            },
            "url": "wss://127.0.0.1"
        },
        "url": "https://127.0.0.1:9999/"
    },
    "rendezvous": {"url": "wss://127.0.0.1"},
    "mediator": {
        "blob": {
            "uploadUrl": "https://127.0.0.1:9999/",
            "downloadUrl": "https://127.0.0.1:9999/",
            "doneUrl": "https://127.0.0.1:9999/"
        },
        "url": "wss://127.0.0.1"
    }
}
F2tmtqkx60L1Q+v8167YwGDjpBnHcccEWT4qMDshA7dSmcywKfvJE4p+DE6N6dnUvm9dYqVt0FW/KMq+cHlPBw==`;

export const WRONG_OPPF_SIGNATURE_STRING = `{
    "work": {"url": "https://127.0.0.1:9999/"},
    "refresh": 86400,
    "avatar": {"url": "https://127.0.0.1:9999/"},
    "updates": {"desktop": {"autoUpdate": true}},
    "version": "1",
    "directory": {"url": "https://127.0.0.1:9999/"},
    "license": {
        "expires": "2024-12-01",
        "count": 1000,
        "id": "opt-o00-5"
    },
    "blob": {
        "uploadUrl": "https://127.0.0.1:9999/",
        "downloadUrl": "https://127.0.0.1:9999/",
        "doneUrl": "https://127.0.0.1:9999/"
    },
    "domains": {
        "rules": [
            {
                "spkis": [
                    {
                        "value": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
                        "algorithm": "sha256"
                    }
                ],
                "fqdn": "*test.ch",
                "matchMode": "include-subdomains"
            }
        ]
    },
    "chat": {"publicKey": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="},
    "signatureKey": "VR4nTeVFeao9TcIJn5KaMsuW6Lc4gMC+j8z//zngvNs=",
    "safe": {
        "rendezvous": {"url": "wss://127.0.0.1"},
        "mediator": {
            "blob": {
                "uploadUrl": "https://127.0.0.1:9999/",
                "downloadUrl": "https://127.0.0.1:9999/",
                "doneUrl": "https://127.0.0.1:9999/"
            },
            "url": "wss://127.0.0.1"
        },
        "url": "https://127.0.0.1:9999/"
    },
    "rendezvous": {"url": "wss://127.0.0.1"},
    "mediator": {
        "blob": {
            "uploadUrl": "https://127.0.0.1:9999/",
            "downloadUrl": "https://127.0.0.1:9999/",
            "doneUrl": "https://127.0.0.1:9999/"
        },
        "url": "wss://127.0.0.1"
    }
}
nK5pc1kHwwH4xWqo4LquaZfuDMOzhgPzjRMgK6B3ype9W3xI2DK+eyHUbaxfQcgGlSFbFxQj++3mFFjnymvJBA==`;

export const LICENSE_EXPIRED_STRING = `{
    "work": {"url": "https://127.0.0.1:9999/"},
    "refresh": 86400,
    "domains": {"rules": [{
        "spkis": [{
            "value": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            "algorithm": "sha256"
        }],
        "fqdn": "*test.ch",
        "matchMode": "include-subdomains"
    }]},
    "avatar": {"url": "https://127.0.0.1:9999/"},
    "updates": {"desktop": {"autoUpdate": true}},
    "version": "1",
    "directory": {"url": "https://127.0.0.1:9999/"},
    "license": {
        "expires": "1970-12-01",
        "count": 1000,
        "id": "opt-o00-5"
    },
    "blob": {
        "uploadUrl": "https://127.0.0.1:9999/",
        "downloadUrl": "https://127.0.0.1:9999/",
        "doneUrl": "https://127.0.0.1:9999/"
    },
    "chat": {"publicKey": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="},
    "signatureKey": "1TrQLW5sipBuw2lcc3Y/gSUGHTzNHuLPN4X9M7Y82m8=",
    "safe": {
        "rendezvous": {"url": "wss://127.0.0.1"},
        "mediator": {
            "blob": {
                "uploadUrl": "https://127.0.0.1:9999/",
                "downloadUrl": "https://127.0.0.1:9999/",
                "doneUrl": "https://127.0.0.1:9999/"
            },
            "url": "wss://127.0.0.1"
        },
        "url": "https://127.0.0.1:9999/"
    },
    "rendezvous": {"url": "wss://127.0.0.1"},
    "mediator": {
        "blob": {
            "uploadUrl": "https://127.0.0.1:9999/",
            "downloadUrl": "https://127.0.0.1:9999/",
            "doneUrl": "https://127.0.0.1:9999/"
        },
        "url": "wss://127.0.0.1"
    }
}
V5neJys6b4JOdMpNzXHcIRbhn8RsEcpKV0mqSkGCa6OVnvAxe4PEIHyRxnuapjV8XyCZwvy78iA8ta2pLHOUDA==`;
