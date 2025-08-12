"use client";
import { Button as _Button } from "@/components/ui/button";
import { Input as _Input } from "@/components/ui/input";
import { Badge as _Badge } from "@/components/ui/badge";
import { Card as _Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Button = _Button;
export const Input = _Input;
export const Badge = _Badge;
export const Card = Object.assign(_Card, { Content: CardContent, Header: CardHeader, Title: CardTitle });
