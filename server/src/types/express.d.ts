declare module 'express' {
    import { Request as ExpressRequest, Response as ExpressResponse, NextFunction as ExpressNextFunction, Router as ExpressRouter } from '@types/express';
    import { Application } from '@types/express';

    const express: {
        (): Application;
        Router(): ExpressRouter;
        json(): any;
        static(root: string): any;
    };

    export = express;
    export type Request = ExpressRequest;
    export type Response = ExpressResponse;
    export type NextFunction = ExpressNextFunction;
    export type Router = ExpressRouter;
    export type Application = Application;
} 