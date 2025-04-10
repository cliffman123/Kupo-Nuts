import '@fortawesome/fontawesome-free/css/all.min.css';
import './App.css';
import React, { Suspense, lazy } from 'react';

const VideoList = lazy(() => import('./components/VideoList'));

function App() {
    return (
        <div>
            <Suspense fallback={<div>Loading...</div>}>
                <VideoList />
            </Suspense>
        </div>
    );
}

export default App;