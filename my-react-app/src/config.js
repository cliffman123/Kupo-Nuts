const config = {
    apiBaseUrl: 'http://localhost:5000/api'
};

const axiosConfig = {
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json'
    }
};

export { config as default, axiosConfig };
