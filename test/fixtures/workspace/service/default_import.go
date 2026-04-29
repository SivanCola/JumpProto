package service

import "example.com/project/gen/activitypb"

func NewDefaultProfile() *activitypb.UserProfile {
	return &activitypb.UserProfile{
		UserName: "default-import",
	}
}
