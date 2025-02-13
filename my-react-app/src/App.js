import '@fortawesome/fontawesome-free/css/all.min.css';
import React, { Suspense, lazy } from 'react';
import './App.css';

const VideoList = lazy(() => import('./components/VideoList'));

function App() {
    return (
        <div>
            <header className="app-header">
                <img src="./nut.png" alt="Nuts" className="app-logo" />
                <h1>Stacks of Kupo Nuts</h1>
            </header>
            <Suspense fallback={<div>Loading...</div>}>
                <VideoList />
            </Suspense>
        </div>
    );
}

export default App;