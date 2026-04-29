package service

import (
	apb "example.com/project/gen/activitypb"
)

func LoadProfile() *apb.UserProfile {
	return &apb.UserProfile{
		UserName: "alias",
	}
}

func TouchProfile(profile *apb.UserProfile) string {
	_ = profile.UserName
	return profile.GetUserName()
}
